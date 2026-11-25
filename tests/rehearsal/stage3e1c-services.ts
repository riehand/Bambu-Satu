// TEST ONLY: gateway service path, separate from production submitAssessment/routes.
import { z } from "zod";
import { signedTransaction } from "./stage3e1b-context";
const command=z.strictObject({sessionId:z.string().uuid(),expectedRevision:z.number().int().nonnegative()});
export async function submitTrustedAssessment(input:unknown) {
  const {sessionId,expectedRevision}=command.parse(input);
  return signedTransaction(async tx=>{
    const [row]=await tx.$queryRaw<Array<{id:string}>>`SELECT wb_guard.submit_assessment(${sessionId}::uuid,${expectedRevision}::integer) AS id`;
    return tx.assessmentSession.findUniqueOrThrow({where:{id:sessionId},include:{score:true,report:{select:{id:true,status:true}}}}).then(session=>{
      if(session.report?.id!==row.id)throw new Error("ATOMIC_RESULT_MISMATCH");
      return session;
    });
  });
}
