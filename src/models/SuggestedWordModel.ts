export interface ISuggestedWordModel {
  text: string;
  normalized_text: string; // Новый атрибут для нормализованного текста
  language: string;
  author: string;
  contributors: string[];
  status: "new" | "processing" | "accepted" | "rejected"; // Added field for status
  dialect: string;
  createdAt: Date;
  pre_translations: string[];
  // Additional fields, if needed
}