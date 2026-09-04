import { useEffect, useState } from "react";
import { countUp, fmtMoney } from "../lib/utils";

export function AnimatedMoney({ value, digits }: { value: number; digits?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => countUp(value, setV, 400), [value]);
  return <>{fmtMoney(v, digits)}</>;
}
