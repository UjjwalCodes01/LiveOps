'use client';

import { useEffect, useState } from 'react';

// Types text out character-by-character like a real terminal — but only
// for text that arrives live after mount. Replayed history renders
// instantly (see CommandFeed), since animating dozens of replayed lines on
// load would just be slow, not lively. Split into two components so the
// static (non-animated) path never touches an effect at all.
export function TypedText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <>{text}</>;
  return <AnimatingText text={text} />;
}

function AnimatingText({ text }: { text: string }) {
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    let index = 0;
    const charsPerTick = Math.max(1, Math.round(text.length / 60));
    let timer: number;
    function tick() {
      index += charsPerTick;
      setVisibleChars(Math.min(index, text.length));
      if (index < text.length) timer = window.setTimeout(tick, 12);
    }
    timer = window.setTimeout(tick, 12);
    return () => window.clearTimeout(timer);
  }, [text]);

  return <>{text.slice(0, visibleChars)}</>;
}
