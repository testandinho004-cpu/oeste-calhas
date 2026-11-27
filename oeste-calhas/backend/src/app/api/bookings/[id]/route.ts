import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fail, sameOrigin } from "@/lib/security";

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return fail("Origem não permitida.", 403);
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail("Faça login com o Google.", 401);
  return fail("Cancelamentos e reagendamentos devem ser solicitados à equipe administrativa.", 403);
}
