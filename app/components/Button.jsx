"use client";

export default function Button({ children, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`mx-1 flex-1 h-7 flex flex-col justify-between items-center rounded-lg shadow-lg ${
        selected ? "bg-[#99C64C] text-black" : "bg-white/10 text-white"
      }`}
    >
      {children}
    </button>
  );
}
