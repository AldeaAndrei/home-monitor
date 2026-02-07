import { twMerge } from "tailwind-merge";

export default function BasePanel({ children, className }) {
  // <div
  //   className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl shadow-lg
  //              bg-gradient-to-br from-teal-400/10 via-cyan-400/10 to-blue-400/10
  //              py-2 px-3"
  // >

  return <div className={twMerge("rounded-2xl bg-white/10 shadow-lg", className)}>{children}</div>;
}
