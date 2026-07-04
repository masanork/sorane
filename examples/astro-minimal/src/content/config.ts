import { defineCollection } from "astro:content";

const posts = defineCollection({
  type: "content",
});

export const collections = { posts };