"use server";

import { auth } from "@/lib/auth";
import { INTERNAL_SIGNUP_SECRET_HEADER } from "@/lib/constants";
import { UserRepository } from "@/lib/repositories/user-repository";
import { signupPolicyRepo } from "@/lib/repositories/platform-access-repository";
import { registrationContextService } from "@/lib/services/registration-context-service";
import { applyRegistrationContextGrants, queueContextGrantDurable } from "@/lib/pipelines/registration-grants";
import { env } from "@/env";
import { getSession } from "@/lib/session";

export type SignUpState = {
  success: boolean;
  error?: string;
  redirectUrl?: string;
  message?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readNameEmailPassword(formData: FormData, session?: Awaited<ReturnType<typeof getSession>>) {
  const emailValue = formData.get("email");
  const password = formData.get("password");
  const nameValue = formData.get("name");

  const email = session?.user.email
    ? normalizeEmail(session.user.email)
    : typeof emailValue === "string"
      ? normalizeEmail(emailValue)
      : "";
  const name = session?.user.name?.trim()
    || (typeof nameValue === "string" ? nameValue.trim() : "");

  return { email, name, password };
}

async function createInternalEmailUser(email: string, password: string, name: string): Promise<SignUpState | null> {
  try {
    await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        username: email.split("@")[0],
        displayUsername: name,
      },
      headers: {
        [INTERNAL_SIGNUP_SECRET_HEADER]: env.INTERNAL_SIGNUP_SECRET,
      },
    });
    return null;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to create the account.",
    };
  }
}

export async function directSignUp(
  _: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const policy = await signupPolicyRepo.get();
  if (!policy.directSignupEnabled) {
    return { success: false, error: "Direct signup is disabled." };
  }

  const session = await getSession();
  if (session) {
    return { success: true, redirectUrl: "/admin/profile" };
  }

  const { email, name, password } = readNameEmailPassword(formData);
  if (!email || !name || typeof password !== "string") {
    return { success: false, error: "Name, email, and password are required." };
  }

  const existingUser = await new UserRepository().findByEmail(email);
  if (existingUser) {
    return {
      success: true,
      redirectUrl: `/sign-in?returnUrl=${encodeURIComponent("/admin/profile")}`,
    };
  }

  const createError = await createInternalEmailUser(email, password, name);
  if (createError) {
    return createError;
  }

  return {
    success: true,
    message: "Check your email to verify your account before continuing.",
  };
}

export async function inviteSignUp(
  _: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const token = formData.get("invite");
  if (typeof token !== "string") {
    return { success: false, error: "Invite token is required." };
  }

  const session = await getSession();
  const { email, name, password } = readNameEmailPassword(formData, session);
  if (!email || !name || (!session && typeof password !== "string")) {
    return { success: false, error: "Name, email, and password are required." };
  }

  const validation = await registrationContextService.validateInvite(token, email);
  if (!validation.valid || !validation.context || !validation.invite) {
    return { success: false, error: validation.error ?? "Invite is not available." };
  }

  const userRepo = new UserRepository();
  const existingUser = await userRepo.findByEmail(email);
  const returnTo = `/sign-up?invite=${encodeURIComponent(token)}`;

  if (session) {
    if (!existingUser || existingUser.id !== session.user.id) {
      return { success: false, error: "Signed-in account does not match this invite." };
    }

    await queueContextGrantDurable(email, validation.context.slug, validation.invite.id, {
      triggerKind: "invite",
      returnUrl: "/admin/profile",
    });

    if (session.user.emailVerified && existingUser.emailVerified) {
      await applyRegistrationContextGrants(session.user.id, session.user.email);
      return { success: true, redirectUrl: "/admin/profile" };
    }

    return {
      success: true,
      message: "Check your email to verify your account before access is applied.",
    };
  }

  if (existingUser) {
    return {
      success: true,
      redirectUrl: `/sign-in?returnUrl=${encodeURIComponent(returnTo)}`,
    };
  }

  const createError = await createInternalEmailUser(email, password as string, name);
  if (createError) {
    return createError;
  }

  await queueContextGrantDurable(email, validation.context.slug, validation.invite.id, {
    triggerKind: "invite",
    returnUrl: "/admin/profile",
  });

  return {
    success: true,
    message: "Check your email to verify your account before continuing.",
  };
}

export async function onboardingSignUp(
  _: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const token = formData.get("intent");

  if (typeof token !== "string") {
    return { success: false, error: "Signup intent is required." };
  }

  const session = await getSession();
  const { email, name, password } = readNameEmailPassword(formData, session);

  if (!email || !name || (!session && typeof password !== "string")) {
    return { success: false, error: "Name, email, and password are required." };
  }

  const validation = await registrationContextService.validateSignupIntent(token, email);
  if (!validation.valid || !validation.context || !validation.payload) {
    return { success: false, error: validation.error ?? "Signup is not available." };
  }
  const context = validation.context;
  const payload = validation.payload;

  const userRepo = new UserRepository();
  const existingUser = await userRepo.findByEmail(email);

  const queueValidatedGrant = () => queueContextGrantDurable(email, context.slug, undefined, {
    triggerKind: payload.trigger.kind,
    triggerClientId:
      payload.trigger.kind === "oauth_client" ? payload.trigger.id : null,
    triggerId: payload.trigger.id,
    requestedGrants: payload.requestedGrants,
    returnUrl: payload.returnUrl,
    nonce: payload.nonce,
    tokenExpiresAt: new Date(payload.exp),
  });

  if (session) {
    if (!existingUser || existingUser.id !== session.user.id) {
      return { success: false, error: "Signed-in account does not match this signup intent." };
    }

    const consumed = await registrationContextService.consumeSignupIntentNonce(
      payload.nonce,
      email
    );
    if (!consumed) {
      return { success: false, error: "Signup link is no longer active." };
    }

    await queueValidatedGrant();

    if (session.user.emailVerified && existingUser.emailVerified) {
      await applyRegistrationContextGrants(session.user.id, session.user.email);
      return {
        success: true,
        redirectUrl: payload.returnUrl,
      };
    }

    return {
      success: true,
      message: "Check your email to verify your account before access is applied.",
    };
  }

  if (existingUser) {
    const returnTo = `/sign-up?intent=${encodeURIComponent(token)}`;
    return {
      success: true,
      redirectUrl: `/sign-in?returnUrl=${encodeURIComponent(returnTo)}`,
    };
  }

  const consumed = await registrationContextService.consumeSignupIntentNonce(
    payload.nonce,
    email
  );
  if (!consumed) {
    return { success: false, error: "Signup link is no longer active." };
  }

  const createError = await createInternalEmailUser(email, password as string, name);
  if (createError) {
    return createError;
  }

  await queueValidatedGrant();

  return {
    success: true,
    message: "Check your email to verify your account before continuing.",
  };
}
