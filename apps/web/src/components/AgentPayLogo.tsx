import ZadperLogo from "../assets/Zadper-logo.png";

type ZadperLogoProps = {
  className?: string;
  decorative?: boolean;
  variant?: "icon" | "full";
};

export function ZadperLogo({ className = "", decorative = false, variant = "icon" }: ZadperLogoProps) {
  return (
    <span className={`agent-pay-logo ${variant} ${className}`}>
      <img
        alt={decorative ? "" : "Zadper logo"}
        aria-hidden={decorative ? true : undefined}
        draggable={false}
        src={ZadperLogo}
      />
      {variant === "full" ? <span className="agent-pay-logo-word">Zadper</span> : null}
    </span>
  );
}
