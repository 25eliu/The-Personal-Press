export function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-3 border-y-2 border-black px-2 py-2 text-center font-head text-lg italic leading-snug">
      {children}
    </blockquote>
  );
}
