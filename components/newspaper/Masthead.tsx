export function Masthead({ masthead, tagline, edition, dateLine }: {
  masthead: string; tagline: string; edition: string; dateLine: string;
}) {
  return (
    <header className="mb-3 text-center">
      <div className="flex items-center justify-between border-b border-black pb-1 text-[10px] uppercase tracking-widest">
        <span>{dateLine}</span>
        <span>Price: Free</span>
        <span>{edition}</span>
      </div>
      <h1 className="font-masthead text-5xl md:text-6xl leading-none mt-2">{masthead}</h1>
      <p className="mt-1 border-y-2 border-black py-0.5 font-head text-sm italic">{tagline}</p>
    </header>
  );
}
