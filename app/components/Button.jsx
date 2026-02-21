"use client";

export default function Button({ children, selected, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`mx-1 flex-1 h-7 flex flex-col justify-between items-center rounded-lg shadow-lg disabled:bg-[#5b5b5b] ${
        selected && !disabled ? "bg-[#99C64C] text-black" : "bg-white/10 text-white"
      }`}
    >
      {children}
    </button>
  );
}
