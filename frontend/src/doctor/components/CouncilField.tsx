import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Landmark } from 'lucide-react';
import useClickOutside from '@shared/useClickOutside';
import { COUNCILS, councilName } from '@shared/councils';

/**
 * State Medical Council picker: type to filter, arrow keys + Enter to pick.
 * Styled like shared/auth's Field. The value is the council's NMC code
 * (e.g. "MAH"); the name is what the doctor sees.
 */
export default function CouncilField({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, open, () => setOpen(false));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNCILS.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : COUNCILS;
  }, [query]);

  function pick(code: string) {
    onChange(code);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-700">
        State Medical Council
      </label>
      <div className="group relative flex items-center rounded-xl border border-border bg-white/70 transition-all duration-200 focus-within:border-brand-purple focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(109,91,208,0.12)]">
        <span className="pl-3.5 text-ink-300 transition-colors duration-200 group-focus-within:text-brand-purple">
          <Landmark size={15} />
        </span>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required && !value}
          value={open ? query : councilName(value)}
          placeholder="Search your council, e.g. Maharashtra"
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && open && matches[active]) {
              e.preventDefault();
              pick(matches[active].code);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="w-full bg-transparent py-3 pl-2.5 pr-9 text-sm text-ink-900 outline-none placeholder:text-ink-300"
        />
        <ChevronDown size={15} className="pointer-events-none absolute right-3 text-ink-300" />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-white py-1 shadow-card"
        >
          {matches.length === 0 && <li className="px-3 py-2 text-xs text-ink-500">No council matches “{query}”.</li>}
          {matches.map((c, i) => (
            <li
              key={c.code}
              role="option"
              aria-selected={c.code === value}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus; pick before blur
                pick(c.code);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-brand-lavender text-ink-900' : 'text-ink-700'} ${
                c.code === value ? 'font-semibold' : ''
              }`}
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11px] text-ink-500">The council you're registered with — checked against the NMC register.</p>
    </div>
  );
}
