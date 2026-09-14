import type { ProofStep } from "../api";
import { ZadperCodeBlock, ZadperSurface } from "./ZadperUi";

export function ZadperProofPath({ proof }: { proof: ProofStep[] }) {
  if (proof.length === 0) {
    return <p className="muted">Verification steps appear after the report is paid.</p>;
  }

  return (
    <div className="proof-path">
      {proof.map((step, index) => (
        <ZadperSurface variant="proof" key={`${step.position}-${step.hash}`}>
          <span className="proof-position">{index + 1}. {step.position}</span>
          <ZadperCodeBlock className="proof-hash">{step.hash}</ZadperCodeBlock>
        </ZadperSurface>
      ))}
    </div>
  );
}
