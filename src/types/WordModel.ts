export interface IWordModel {
    _id: string;
    text: string;
    normalized_text: string; // Новый атрибут для нормализованного текста
    language: string;
    author: any;
    contributors: string[];
    translations: any[];
    translations_u: any[];
    createdAt: Date;
    dialect: string;
    // Additional fields, if needed
}