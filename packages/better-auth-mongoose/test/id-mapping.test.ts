import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import {
  generateObjectIdString,
  customIdGenerator,
  makeCustomTransformInput,
  makeCustomTransformOutput,
} from "../src/id-mapping";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { BetterAuthOptions } from "better-auth";

const idField: DBFieldAttribute = { type: "string", required: true, fieldName: "id" };
const referenceField: DBFieldAttribute = {
  type: "string",
  required: true,
  fieldName: "userId",
  references: { model: "user", field: "id", onDelete: "cascade" },
};
const plainField: DBFieldAttribute = { type: "string", required: true, fieldName: "name" };

const baseProps = {
  model: "user",
  schema: {} as any,
  options: {} as BetterAuthOptions,
};

describe("generateObjectIdString / customIdGenerator", () => {
  it("produces a 24-character hex string that is a valid ObjectId", () => {
    const id = generateObjectIdString();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(() => new Types.ObjectId(id)).not.toThrow();
  });

  it("customIdGenerator matches the AdapterFactoryConfig signature and returns a valid id", () => {
    const id = customIdGenerator({ model: "user" });
    expect(id).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("customTransformInput", () => {
  const transformInput = makeCustomTransformInput();

  it("coerces a hex-string _id to a real ObjectId on create", () => {
    const idHex = generateObjectIdString();
    const result = transformInput({
      ...baseProps,
      data: idHex,
      field: "_id",
      fieldAttributes: idField,
      action: "create",
    });
    expect(result).toBeInstanceOf(Types.ObjectId);
    expect((result as InstanceType<typeof Types.ObjectId>).toHexString()).toBe(idHex);
  });

  it("coerces a reference field (references.field === 'id') the same way", () => {
    const idHex = generateObjectIdString();
    const result = transformInput({
      ...baseProps,
      data: idHex,
      field: "userId",
      fieldAttributes: referenceField,
      action: "create",
    });
    expect(result).toBeInstanceOf(Types.ObjectId);
  });

  it("falls back to the original string when it isn't a valid ObjectId hex value", () => {
    const result = transformInput({
      ...baseProps,
      data: "not-a-valid-object-id",
      field: "_id",
      fieldAttributes: idField,
      action: "create",
    });
    expect(result).toBe("not-a-valid-object-id");
  });

  it("leaves non-id fields untouched", () => {
    const result = transformInput({
      ...baseProps,
      data: "Ada Lovelace",
      field: "name",
      fieldAttributes: plainField,
      action: "create",
    });
    expect(result).toBe("Ada Lovelace");
  });

  it("does not coerce id fields for read actions (findOne/findMany/count)", () => {
    const idHex = generateObjectIdString();
    const result = transformInput({
      ...baseProps,
      data: idHex,
      field: "_id",
      fieldAttributes: idField,
      action: "findOne",
    });
    expect(result).toBe(idHex);
  });
});

describe("customTransformOutput", () => {
  const transformOutput = makeCustomTransformOutput();

  it("converts an ObjectId id field back to a hex string", () => {
    const objectId = new Types.ObjectId();
    const result = transformOutput({
      ...baseProps,
      data: objectId,
      field: "id",
      fieldAttributes: idField,
      select: [],
    });
    expect(result).toBe(objectId.toHexString());
  });

  it("converts a reference field's ObjectId back to a hex string", () => {
    const objectId = new Types.ObjectId();
    const result = transformOutput({
      ...baseProps,
      data: objectId,
      field: "userId",
      fieldAttributes: referenceField,
      select: [],
    });
    expect(result).toBe(objectId.toHexString());
  });

  it("leaves non-id fields untouched", () => {
    const result = transformOutput({
      ...baseProps,
      data: "Ada Lovelace",
      field: "name",
      fieldAttributes: plainField,
      select: [],
    });
    expect(result).toBe("Ada Lovelace");
  });
});
