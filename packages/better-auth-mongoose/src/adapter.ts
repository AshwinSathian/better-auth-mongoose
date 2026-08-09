import type { ClientSession, Connection } from "mongoose";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import type {
  AdapterFactoryConfig,
  CustomAdapter,
  DBTransactionAdapter,
} from "@better-auth/core/db/adapter";
import type { BetterAuthOptions } from "better-auth";
import { registerModels } from "./schema/register-models";
import {
  customIdGenerator,
  makeCustomTransformInput,
  makeCustomTransformOutput,
} from "./id-mapping";
import { makeCreate } from "./operations/create";
import { makeFindOne, makeFindMany, makeCount, type GetFieldName } from "./operations/read";
import { makeUpdate, makeUpdateMany } from "./operations/update";
import { makeDelete, makeDeleteMany, makeConsumeOne } from "./operations/delete";
import { supportsSessions } from "./transaction";
import { makeCreateSchema } from "./create-schema";
import type { AnyModel, MongooseAdapterOptions } from "./types";

function buildCustomAdapter(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter {
  return {
    create: makeCreate(models, session),
    findOne: makeFindOne(models, getFieldName, session),
    findMany: makeFindMany(models, getFieldName, session),
    count: makeCount(models, getFieldName, session),
    update: makeUpdate(models, getFieldName, session),
    updateMany: makeUpdateMany(models, getFieldName, session),
    delete: makeDelete(models, getFieldName, session),
    deleteMany: makeDeleteMany(models, getFieldName, session),
    consumeOne: makeConsumeOne(models, getFieldName, session),
    createSchema: makeCreateSchema(),
  };
}

export function mongooseAdapter(connection: Connection, options: MongooseAdapterOptions = {}) {
  let lazyOptions: BetterAuthOptions;
  let lazyModels: Map<string, AnyModel> | undefined;
  let lazyGetFieldName: GetFieldName | undefined;
  let lazyModelsReady: Promise<void> | undefined;

  const transactionsEnabled = options.transactions ?? true;

  // Builds a fully-wrapped adapter (transformInput/Output, id mapping,
  // everything a top-level adapter gets) scoped to an optional session, by
  // recursively invoking createAdapterFactory. This is what makes a callback
  // passed to transaction() see the same behavior as the outer adapter,
  // just atomic when a session is provided.
  function wrapScopedAdapter(session?: ClientSession): DBTransactionAdapter {
    return createAdapterFactory({
      config: { ...baseConfig, transaction: false },
      adapter: () => buildCustomAdapter(lazyModels!, lazyGetFieldName!, session),
    })(lazyOptions) as DBTransactionAdapter;
  }

  const baseConfig: AdapterFactoryConfig = {
    adapterId: "mongoose-adapter",
    adapterName: "Mongoose Adapter",
    usePlural: options.usePlural ?? false,
    debugLogs: options.debugLogs ?? false,
    supportsJSON: true,
    supportsDates: true,
    supportsBooleans: true,
    supportsNumericIds: false,
    mapKeysTransformInput: { id: "_id" },
    mapKeysTransformOutput: { _id: "id" },
    customIdGenerator,
    customTransformInput: makeCustomTransformInput(),
    customTransformOutput: makeCustomTransformOutput(),
    transaction: transactionsEnabled
      ? async <R>(cb: (trx: DBTransactionAdapter) => Promise<R>): Promise<R> => {
          if (!lazyModels || !lazyGetFieldName) {
            throw new Error(
              "better-auth-mongoose: transaction() was called before the adapter finished initializing",
            );
          }

          // MongoDB rejects implicitly creating a collection as part of the
          // first write *inside* a transaction ("due to catalog changes;
          // please retry the operation") — and creating it concurrently from
          // outside the transaction while one is already open invalidates
          // that transaction's snapshot the same way. So every collection
          // must be confirmed to exist *before* startSession()/
          // startTransaction() is ever called, not lazily on first write.
          await lazyModelsReady;

          if (!(await supportsSessions(connection))) {
            // Standalone mongod: no replica set, no sessions available.
            // Degrade to running the callback without a transaction rather
            // than crashing on boot.
            return cb(wrapScopedAdapter());
          }

          const session = await connection.startSession();
          try {
            let result!: R;
            await session.withTransaction(async () => {
              result = await cb(wrapScopedAdapter(session));
            });
            return result;
          } finally {
            await session.endSession();
          }
        }
      : false,
  };

  const lazyAdapter = createAdapterFactory({
    config: baseConfig,
    adapter: ({ schema, getFieldName }) => {
      lazyModels = registerModels(connection, schema, options);
      lazyGetFieldName = getFieldName;
      lazyModelsReady = Promise.all(
        Array.from(lazyModels.values()).map((model) =>
          model.createCollection().then(() => undefined),
        ),
      ).then(() => undefined);
      return buildCustomAdapter(lazyModels, lazyGetFieldName);
    },
  });

  return (betterAuthOptions: BetterAuthOptions) => {
    lazyOptions = betterAuthOptions;
    return lazyAdapter(betterAuthOptions);
  };
}
