import type { PrismaClient, User } from "@prisma/client";

export class UserService {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureUser(input: { discordId: string; username: string }): Promise<User> {
    return this.prisma.user.upsert({
      where: { discordId: input.discordId },
      update: { username: input.username },
      create: {
        discordId: input.discordId,
        username: input.username
      }
    });
  }
}
