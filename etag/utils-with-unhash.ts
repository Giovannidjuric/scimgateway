// Alternative approach: Import unhashId function
// NOTE: This creates circular dependencies and requires LDAP context

import * as crypto from "node:crypto";
import { 
  PermissionSchema, 
  UserSchema, 
  type PermissionHashProps, 
  type UserHashProps 
} from "./zod";
import { ZodError } from "zod/v4";

// Import unhashId from plugin-ldap.ts (requires careful handling)
// This would require extracting unhashId to a separate module to avoid circular deps

type ObjWithId = { id: string } & Record<string, any>;
type ObjWithContext = ObjWithId & { 
  _baseEntity?: string; 
  _ctx?: any; 
};

const getOrganizationalUnit = (objectId: string) => {
  const decodedId = decodeURIComponent(objectId);
  const parts = decodedId.split(",");
  const organizationalUnit = parts.find(
    (part) => part.includes("ou=permissions") || part.includes("ou=users") || part.includes("ou=groups")
  );
  if (!organizationalUnit) return "ou=permissions";
  return organizationalUnit;
};

const isUser = (ou: string) => ou === "ou=users";
const isPermission = (ou: string) => ou === "ou=permissions" || ou === "ou=groups";

const prepareHashObject = (organizationalUnit: string, obj: ObjWithId) => {
  let hashInput: UserHashProps | PermissionHashProps | undefined;
  if (isUser(organizationalUnit)) {
    try {
      hashInput = UserSchema.parse(obj);
    } catch (error) {
      if (error instanceof ZodError) console.log(error.message);
      throw error;
    }
  } else if (isPermission(organizationalUnit)) {
    try {
      hashInput = PermissionSchema.parse(obj);
    } catch (error) {
      if (error instanceof ZodError) console.log(error.message);
      throw error;
    }
  }
  return hashInput;
};

export const getEtagWithUnhash = async function (obj: ObjWithContext): Promise<string> {
  if (typeof obj !== "object" || obj === null) return "";
  if (obj.id === undefined) {
    throw new Error("Requested object has no Id");
  }
  
  // This would require unhashId function and LDAP context
  // const plainId = await unhashId(obj._baseEntity || 'undefined', obj.id, obj._ctx || {});
  
  // For now, assume the ID is already unhashed or handle accordingly
  const plainId = obj.id; // This would be: await unhashId(...)
  const organizationalUnit = getOrganizationalUnit(plainId);
  
  try {
    const hashInput = prepareHashObject(organizationalUnit, obj);
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(hashInput), "utf8")
      .digest("base64url")
      .substring(0, 22);

    let eTag = "";
    if (obj?.meta?.version) eTag = obj.meta.version;
    else {
      eTag = `W/"${hash}"`;
      if (!obj.meta) obj.meta = {};
      obj.meta.version = eTag;
    }
    return eTag;
  } catch (error) {
    throw error;
  }
};