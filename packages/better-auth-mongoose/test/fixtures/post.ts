import { Schema, type Connection, type Model } from "mongoose";

export function definePostModel(connection: Connection): Model<any> {
  return connection.model(
    "Post",
    new Schema({
      _id: Schema.Types.ObjectId,
      title: { type: String, required: true },
      author: { type: Schema.Types.ObjectId, ref: "user", required: true },
    }),
  );
}
