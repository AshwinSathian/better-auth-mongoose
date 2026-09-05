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
    // A caller-supplied :id that isn't valid ObjectId hex would otherwise
    // reach Mongoose's own cast and throw a CastError the controller doesn't
    // catch, surfacing as an unhandled 500 instead of the 404 a malformed
    // (or simply guessed-wrong) id should produce.
    if (!mongoose.isValidObjectId(id)) return null;
    return this.postModel.findById(id).populate("author").lean().exec();
  }
}
