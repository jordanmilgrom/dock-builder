"use client";

import { useEffect } from "react";
import { EMBED_MESSAGE_RESIZE } from "@/lib/embed";

/**
 * Posts the iframe's content height to the parent window so the embed loader can
 * size the iframe (no inner scrollbars). Only sends size data; reads nothing
 * from the host page.
 */
export default function EmbedResizer() {
  useEffect(() => {
    const post = () => {
      const height = document.documentElement.scrollHeight;
      // Target "*": the parent's loader validates message.origin against the app
      // origin, so we don't need to know the host page origin here.
      window.parent?.postMessage({ type: EMBED_MESSAGE_RESIZE, height }, "*");
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    const id = window.setInterval(post, 1000);
    return () => {
      ro.disconnect();
      window.clearInterval(id);
    };
  }, []);
  return null;
}
