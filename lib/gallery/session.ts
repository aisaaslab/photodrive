import { SignJWT, jwtVerify } from "jose";

const secret = () => {
  const key = process.env.GALLERY_JWT_SECRET;
  if (!key) throw new Error("GALLERY_JWT_SECRET is not set");
  return new TextEncoder().encode(key);
};

export async function signGalleryToken(galleryId: string, pwVersion = 0): Promise<string> {
  return new SignJWT({ galleryId, v: pwVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyGalleryToken(
  token: string
): Promise<{ galleryId: string; v: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { galleryId: payload.galleryId as string, v: (payload.v as number) ?? 0 };
  } catch {
    return null;
  }
}
