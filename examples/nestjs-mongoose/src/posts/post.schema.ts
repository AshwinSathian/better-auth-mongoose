import { Schema, type Connection } from "mongoose";
import type { AnyModel } from "./types";

export function definePostModel(connection: Connection): AnyModel {
  return (
    connection.models.Post ??
    connection.model(
      "Post",
      new Schema({
        // No explicit _id here — Mongoose auto-generates a real ObjectId,
        // same as any other model with no reason to correlate its own id
        // with anything else. Only `author` needs to line up with Better
        // Auth's user ids, which is the whole point of this example.
        title: { type: String, required: true },
        author: { type: Schema.Types.ObjectId, ref: "user", required: true },
      }),
    )
  );
}
