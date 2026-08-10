import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import mongoose from "mongoose";
import { createAuth } from "./auth/auth.config";
import { PostsModule } from "./posts/posts.module";

@Module({
  imports: [
    AuthModule.forRootAsync({
      useFactory: async () => {
        const uri = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/nestjs-mongoose-example";
        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(uri);
        }
        return { auth: createAuth(mongoose.connection) };
      },
    }),
    PostsModule,
  ],
})
export class AppModule {}
