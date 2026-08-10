import { Injectable, OnModuleInit } from "@nestjs/common";
import mongoose from "mongoose";
import { definePostModel } from "./post.schema";
import type { AnyModel } from "./types";

@Injectable()
export class PostsService implements OnModuleInit {
  private postModel!: AnyModel;

  onModuleInit() {
    this.postModel = definePostModel(mongoose.connection);
  }

  create(data: { title: string; author: unknown }) {
    return this.postModel.create(data);
  }

  findById(id: string) {
    return this.postModel.findById(id).populate("author").lean().exec();
  }
}
