"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Input, Label, Card, CardContent, Icon } from "@/components/ui";
import { resetPassword } from "./actions";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const token = searchParams.get("token");
  const tokenError = searchParams.get("error");

  React.useEffect(() => {
    if (tokenError === "INVALID_TOKEN") {
      setError("Invalid or expired password reset link. Please request a new one.");
    }
  }, [tokenError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Missing password reset token");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword(token, password);
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push("/sign-in");
        }, 2000);
      } else {
        setError(result.error || "Failed to reset password");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token && !tokenError) {
    return (
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="pt-10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <Icon name="alert-circle" size="xl" className="text-red-500" />
            </div>
          </div>
          <header className="space-y-3 text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Invalid Link</h1>
            <p className="text-sm text-gray-400">
              This password reset link is invalid. Please request a new one.
            </p>
          </header>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="pt-10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <Icon name="check-circle" size="xl" className="text-green-500" />
            </div>
          </div>
          <header className="space-y-3 text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Password Reset Successful</h1>
            <p className="text-sm text-gray-400">
              Your password has been reset successfully. Redirecting to sign in...
            </p>
          </header>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardContent className="pt-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Icon name="lock" size="xl" className="text-primary" filled />
          </div>
        </div>
        
        <header className="space-y-3 text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Reset Password</h1>
          <p className="text-sm text-gray-400">
            Enter your new password below
          </p>
        </header>

        <section>
          <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
              disabled={isLoading || !!tokenError}
              required
            />
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={isLoading || !!tokenError}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button 
            type="submit" 
            variant="primary" 
            size="sm"
            className="w-full"
            disabled={isLoading || !!tokenError}
          >
            {isLoading ? "Resetting..." : "Reset Password"}
          </Button>
          </form>
        </section>
      </CardContent>
    </Card>
  );
}
