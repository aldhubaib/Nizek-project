"use client";

import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import {
  articleHtmlHasContent,
  parseArticleValue,
  stringifyArticleValue,
  type ArticleLang,
  type ArticleValue,
} from "@/lib/fields/article";
import { cn } from "@/lib/utils";

const PLACEHOLDER: Record<ArticleLang, string> = {
  en: "Write the article… (type / for commands)",
  ar: "اكتب المقال… (اكتب / للأوامر)",
};

export function ArticleField({
  value,
  onChange,
  projectId,
}: {
  value: string;
  onChange: (next: string) => void;
  projectId?: string;
}) {
  const article = parseArticleValue(value);
  const [lang, setLang] = useState<ArticleLang>(() =>
    articleHtmlHasContent(article.ar) && !articleHtmlHasContent(article.en)
      ? "ar"
      : "en",
  );
  const articleRef = useRef(article);
  articleRef.current = article;

  function commit(next: ArticleValue) {
    articleRef.current = next;
    onChange(stringifyArticleValue(next));
  }

  function switchLang(next: ArticleLang) {
    if (next === lang) return;
    setLang(next);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Language</Label>
        <div className="flex h-9 rounded-md border border-input p-0.5">
          {(
            [
              { id: "en", label: "English" },
              { id: "ar", label: "العربية" },
            ] as const
          ).map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={lang === choice.id}
              onClick={() => switchLang(choice.id)}
              className={cn(
                "flex-1 rounded-sm text-s transition-colors",
                lang === choice.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Same editor as notes. Write one language, then switch to translate
          the other. Required is met when English or Arabic has text.
        </p>
      </div>
      <div dir={lang === "ar" ? "rtl" : "ltr"}>
        <RichTextEditor
          key={lang}
          content={article[lang]}
          onChange={(html) => commit({ ...articleRef.current, [lang]: html })}
          placeholder={PLACEHOLDER[lang]}
          borderless
          toolbar
          projectId={projectId}
        />
      </div>
    </div>
  );
}
