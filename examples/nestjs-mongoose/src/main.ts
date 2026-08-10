import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // bodyParser: false is required by @thallesp/nestjs-better-auth — it
  // installs its own body parsing (covering both the auth routes and the
  // rest of the app) so Better Auth's handler sees the raw request body.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
