import { z } from "zod";
import { Email } from "../vo/email";
import { UserId } from "../vo/user-id";
import { UserName } from "../vo/user-name";

export const UserSchema = z
  .object({
    id: UserId.field(),
    email: Email.field(),
    name: UserName.field(),
    roles: z.array(z.string().min(1, "role não pode ser vazio")),
    createdAt: z.date(),
    updatedAt: z.date(),
    version: z.number().int().min(1),
  })
  .refine(state => state.updatedAt >= state.createdAt, {
    error: "updatedAt cannot precede createdAt",
    path: ["updatedAt"],
  });

export type IUser = z.input<typeof UserSchema>;
