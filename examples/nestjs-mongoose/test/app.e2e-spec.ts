import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AppModule } from "../src/app.module";

let app: INestApplication;
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replSet.getUri();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ bodyParser: false });
  await app.init();
});

afterAll(async () => {
  await app.close();
  await mongoose.disconnect();
  await replSet.stop();
});

describe("NestJS + Mongoose + better-auth-mongoose example", () => {
  it("signs up a user, creates a post referencing them, and returns it populated", async () => {
    const server = app.getHttpServer();

    const signUp = await request(server).post("/api/auth/sign-up/email").send({
      email: "example@example.com",
      password: "correct-horse-battery-staple",
      name: "Example User",
    });

    expect(signUp.status).toBe(200);
    const cookie = signUp.headers["set-cookie"];
    expect(cookie).toBeDefined();

    const createPost = await request(server)
      .post("/posts")
      .set("Cookie", cookie)
      .send({ title: "Hello from the example app" });

    expect(createPost.status).toBe(201);
    expect(createPost.body.id).toBeDefined();

    const getPost = await request(server).get(`/posts/${createPost.body.id}`);

    expect(getPost.status).toBe(200);
    expect(getPost.body.title).toBe("Hello from the example app");
    expect(getPost.body.author.email).toBe("example@example.com");
  });

  it("returns 404 for a malformed post id instead of an unhandled cast error", async () => {
    const server = app.getHttpServer();

    const getPost = await request(server).get("/posts/not-a-valid-object-id");

    expect(getPost.status).toBe(404);
  });
});
