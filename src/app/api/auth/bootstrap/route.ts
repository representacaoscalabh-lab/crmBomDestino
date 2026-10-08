import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Token de autenticação ausente." }, { status: 401 });

  const initialAdminEmail = process.env.FIREBASE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!initialAdminEmail) {
    return NextResponse.json({ error: "FIREBASE_ADMIN_EMAIL não está configurado." }, { status: 503 });
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ error: "FIREBASE_SERVICE_ACCOUNT_JSON não está configurado." }, { status: 503 });
  }

  let identity: DecodedIdToken;
  try {
    const { adminAuth } = await import("@/lib/firebase-admin").then(({ getAdminServices }) => getAdminServices());
    identity = await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Falha ao verificar o token Firebase.", error);
    return NextResponse.json({ error: "A sessão Firebase é inválida ou expirou." }, { status: 401 });
  }

  if (identity.email?.toLowerCase() !== initialAdminEmail || !identity.email_verified) {
    return NextResponse.json({ bootstrapped: false }, { status: 200 });
  }

  try {
    const { adminDb } = await import("@/lib/firebase-admin").then(({ getAdminServices }) => getAdminServices());
    const userRef = adminDb.collection("users").doc(identity.uid);
    const userSnapshot = await userRef.get();
    if (userSnapshot.exists && userSnapshot.data()?.role === "admin") {
      return NextResponse.json({ bootstrapped: true }, { status: 200 });
    }

    await userRef.set({
      uid: identity.uid,
      email: identity.email,
      name: identity.name ?? "",
      status: "approved",
      role: "admin",
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ bootstrapped: true }, { status: 200 });
  } catch (error) {
    console.error("Falha ao inicializar o administrador do CRM.", error);
    return NextResponse.json({ error: "Falha no serviço ao provisionar o administrador inicial." }, { status: 500 });
  }
}
