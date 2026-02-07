export default function ScrollView({ children }) {
  return (
    <div className="no-scrollbar flex gap-2 w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x">
      {children}
    </div>
  );
}
