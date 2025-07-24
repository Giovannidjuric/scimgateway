import * as z from "zod/v4";

export const UserSchema = z
  .object({
    // id: z.string(),
    userName: z.string(),
    // uidNumber: z.string(),
    // gidNumber: z.string(),
    name: z
      .object({
        givenName: z.string().optional(),
        familyName: z.string().optional(),
        formatted: z.string().optional(),
      })
      .optional(),
    emails: z.array(
      z.object({
        type: z.string(),
        value: z.string(),
      })
    ),
    entitlements: z
      .array(
        z.object({
          type: z.string(),
          value: z.string(),
        })
      )
      .transform((arr) => arr.filter((e) => e.type === "secret")),
  })
  .partial();

export const PermissionSchema = z
  .object({
    displayName: z.string(),
    members: z.array(
      z.object({
        value: z.string().optional(),
      })
    ),
  })
  .partial();

export type UserHashProps = z.infer<typeof UserSchema>;

export type PermissionHashProps = z.infer<typeof PermissionSchema>;
