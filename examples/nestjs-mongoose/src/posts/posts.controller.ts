import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { coerceToObjectId } from "better-auth-mongoose";
import { PostsService } from "./posts.service";

@Controller("posts")
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // Requires authentication (the global AuthGuard, no @AllowAnonymous here) —
  // @Session() gives us the signed-in user without touching cookies/headers
  // ourselves. The post's author is the authenticated user's own Better
  // Auth id, converted the same way test/populate.test.ts does.
  @Post()
  @HttpCode(201)
  async create(@Session() session: UserSession, @Body() body: { title: string }) {
    const created = await this.postsService.create({
      title: body.title,
      author: coerceToObjectId(session.user.id),
    });
    return { id: created._id.toString(), title: created.title };
  }

  // Public: proves the differentiator (a consumer model .populate()-ing a
  // Better-Auth-created user) doesn't require an authenticated request to
  // demonstrate — reading is unrelated to who's logged in.
  @AllowAnonymous()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const post = await this.postsService.findById(id);
    if (!post) throw new NotFoundException();
    return {
      id: post._id.toString(),
      title: post.title,
      author: post.author,
    };
  }
}
