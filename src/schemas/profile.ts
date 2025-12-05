import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  displayUsername: z.string().min(2, "Display username must be at least 2 characters").optional().or(z.literal("")),
});
