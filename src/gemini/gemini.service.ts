import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private readonly genAI: GoogleGenerativeAI;
    private readonly apiKey: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.error('GEMINI_API_KEY is not configured');
            throw new Error('GEMINI_API_KEY is not configured');
        }
        this.apiKey = apiKey;
        this.logger.log('Gemini API initialized successfully');
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /**
     * Generate text using Gemini 2.0 Flash (for SEO, writing, humanizing)
     */
    async generateText(prompt: string, systemInstruction?: string): Promise<string> {
        try {
            const model = this.genAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                systemInstruction: systemInstruction,
            });

            const result = await model.generateContent(prompt);
            const response = result.response;
            return response.text() || '';
        } catch (error) {
            this.logger.error('Text generation failed', error);
            throw error;
        }
    }

    /**
     * Generate image using Gemini 2.5 Flash Image model via REST API
     */
    async generateImage(prompt: string): Promise<Buffer | null> {
        try {
            this.logger.log(`Generating image with gemini-2.5-flash-image: ${prompt.substring(0, 40)}...`);

            // Use gemini-2.5-flash-image model via REST API
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${this.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Generate a high-quality image: ${prompt}. 
Style: Photorealistic or clean modern minimalist illustration. 
IMPORTANT: DO NOT generate any text, words, labels, infographics, charts, or diagrams. 
Focus on visual storytelling without any written elements. 
Aesthetic: Professional, classy, pastel accents, editorial quality.`
                        }]
                    }],
                    generationConfig: {
                        responseModalities: ['TEXT', 'IMAGE'],
                    }
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.warn(`Image API error ${response.status}: ${errorText.substring(0, 300)}`);
                return null;
            }

            const data = await response.json();

            // Extract the base64 image from the response candidates
            if (data.candidates && data.candidates[0]?.content?.parts) {
                for (const part of data.candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        this.logger.log('Image generated successfully');
                        return Buffer.from(part.inlineData.data, 'base64');
                    }
                }
            }

            this.logger.warn('No image data in response');
            return null;
        } catch (error) {
            this.logger.error('Image generation failed', error);
            return null;
        }
    }

    /**
     * Suggest a category for an article based on topic and existing categories
     */
    async suggestCategory(topic: string, existingCategories: string[]): Promise<{
        categoryName: string;
        isNew: boolean;
        description?: string;
    }> {
        const systemInstruction = `You are a content categorization expert. Given an article topic and list of existing categories, determine the best category for this article.

RULES:
1. If an existing category fits well, use it EXACTLY as written (case-sensitive)
2. Only suggest a NEW category if none of the existing ones are a good fit
3. Keep category names short (1-3 words), professional, and broad enough for multiple articles
4. Avoid overly specific categories

Respond in valid JSON format only:
{
  "categoryName": "Category Name",
  "isNew": true/false,
  "description": "Brief description (only if isNew is true)"
}`;

        const categoriesContext = existingCategories.length > 0
            ? `Existing categories: ${existingCategories.join(', ')}`
            : 'No existing categories yet. Suggest an appropriate new category.';

        const response = await this.generateText(
            `Determine the best category for an article about: "${topic}"\n\n${categoriesContext}`,
            systemInstruction
        );

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                this.logger.log(`Category suggestion: ${result.categoryName} (new: ${result.isNew})`);
                return result;
            }
            throw new Error('No valid JSON found in response');
        } catch (error) {
            this.logger.error('Failed to parse category suggestion', error);
            // Return a default category
            return {
                categoryName: 'General',
                isNew: existingCategories.indexOf('General') === -1,
                description: 'General articles and topics'
            };
        }
    }

    /**
     * Suggest an SEO-optimized URL slug for an article
     */
    async suggestSlug(topic: string): Promise<string> {
        const systemInstruction = `You are an SEO expert. Given an article topic, suggest a clean, keyword-rich, and optimized URL slug.
        
RULES:
1. Use only lowercase letters, numbers, and hyphens
2. Remove all special characters and stop words if they don't add SEO value
3. Keep it between 3-7 words
4. Target high-value keywords related to the topic
5. Do NOT include any prefix like /blog/ or domain name
6. Return ONLY the slug string, no quotes or meta-commentary.`;

        try {
            const response = await this.generateText(
                `Suggest an SEO-optimized slug for: "${topic}"`,
                systemInstruction
            );
            return response.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        } catch (error) {
            this.logger.error('Failed to suggest slug', error);
            // Fallback to basic cleaning
            return topic.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 50);
        }
    }

    /**
     * SEO Research Stage - Extract keywords, structure, and meta
     */
    async seoResearch(topic: string): Promise<{
        keywords: string[];
        h2Structure: { h2: string; h3s: string[] }[];
        metaDescription: string;
    }> {
        const systemInstruction = `You are an expert SEO researcher. Analyze the given topic and provide:
1. A list of 8-12 high-value keywords
2. An H2/H3 structure for a comprehensive article (4-6 H2s with 2-3 H3s each)
3. A compelling meta description (150-160 characters)

Respond in valid JSON format only:
{
  "keywords": ["keyword1", "keyword2", ...],
  "h2Structure": [
    { "h2": "Main Section Title", "h3s": ["Subsection 1", "Subsection 2"] }
  ],
  "metaDescription": "Your meta description here"
}`;

        const response = await this.generateText(
            `Research SEO strategy for the topic: "${topic}"`,
            systemInstruction
        );

        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('No valid JSON found in response');
        } catch (error) {
            this.logger.error('Failed to parse SEO research response', error);
            throw error;
        }
    }

    /**
     * Long-form Writing Stage - Generate article with image placeholders
     */
    async writeArticle(
        topic: string,
        keywords: string[],
        h2Structure: { h2: string; h3s: string[] }[]
    ): Promise<{ title: string; content: string }> {
        const systemInstruction = `You are an elite investigative journalist and technical storyteller. Write a comprehensive, deeply engaging article that feels like it was written by a human expert with a unique perspective.

CRITICAL WRITING STYLE RULES (TO AVOID AI DETECTION):
1. **NO AI CLICHÉS**: Avoid phrases like "In today's fast-paced world," "In the rapidly evolving landscape," "It's important to note," or "Furthermore."
2. **HIGH PERPLEXITY & BURSTINESS**: 
   - Vary sentence structures dramatically.
   - Mix short, punchy statements (4-8 words) with longer, descriptive sentences.
   - Avoid rhythmic patterns that feel robotic.
3. **OPINIONATED & ACTIVE**:
   - Use a strong, confident, and professional voice.
   - Speak directly to the reader ("you").
   - Don't just list facts—explain the "why" and share "secret" insights.
4. **NATURAL TRANSITIONS**: Use conversational shifts like "Now, here's the catch:", "But wait—", "Look,", or "This is where it gets interesting."
5. **WORD COUNT**: Aim for 1200+ words of dense, high-value content.

FORMATTING:
- Use markdown.
- Start with a compelling H1 title.
- Include [IMAGE_PROMPT_1], [IMAGE_PROMPT_2], [IMAGE_PROMPT_3] placeholders.
- Add an image description: <!-- Image: [what the image shows] -->

IMPORTANT: Output ONLY the markdown article content.`;

        const prompt = `Write an article about: "${topic}"
    
Keywords to incorporate: ${keywords.join(', ')}

Follow this structure:
${h2Structure.map(s => `## ${s.h2}\n${s.h3s.map(h3 => `### ${h3}`).join('\n')}`).join('\n\n')}`;

        const response = await this.generateText(prompt, systemInstruction);

        try {
            // Clean the response - remove any code fences if present
            let content = response
                .replace(/^```markdown\n?/i, '')
                .replace(/^```\n?/, '')
                .replace(/\n?```$/g, '')
                .trim();

            // Extract title from first H1 heading
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : topic;

            this.logger.log(`Article written: "${title}" (${content.length} chars)`);

            return { title, content };
        } catch (error) {
            this.logger.error('Failed to process article response', error);
            // Return with default title if parsing fails
            return { title: topic, content: response };
        }
    }

    /**
     * Humanizer Stage - Make content more natural and engaging
     */
    async humanizeContent(content: string): Promise<string> {
        const systemInstruction = `You are a "Humanizer" specialist. Your job is to take content and strip away every trace of machine-generated syntax.

THE "HUMAN" CHECKLIST:
1. **Contractions**: Use "don't", "can't", "you're", "it's", etc., instead of formal versions.
2. **Rhetorical Questions**: Intersperse questions to the reader to create a dialogue.
3. **Sentence Variations**: Break up long blocks. Use occasional one-sentence paragraphs for emphasis.
4. **Natural Vocabulary**: Replace formal AI transitions (Additionally, Consequently, Thus) with natural ones (Also, So, What's more,).
5. **Authenticity**: Add occasional opinionated language ("Truth be told,", "I've seen this fail many times when...", "This part is crucial:").
6. **Sentence Burstiness**: Break up any rhythmic, repetitive sentence lengths.

Return ONLY the humanized markdown content. Maintain all [IMAGE_PROMPT] tags and structure intact.`;

        return this.generateText(
            `Humanize this content while preserving all formatting and image placeholders:\n\n${content}`,
            systemInstruction
        );
    }

    /**
     * Interactive Component Stage - Decide and generate component config
     */
    async generateInteractiveComponent(
        topic: string,
        content: string
    ): Promise<{ type: string; config: Record<string, unknown> } | null> {
        const systemInstruction = `You are a UX expert. Analyze the article and decide if it would benefit from an interactive component.

Types of components you can suggest:
1. "roi_calculator" - For business/finance topics with calculations
2. "quiz" - For educational content to test reader knowledge
3. "comparison_table" - For product/feature comparisons
4. "checklist" - For how-to or process articles
5. null - If no component would add value

If suggesting a component, provide its configuration in JSON format:

For roi_calculator:
{ "type": "roi_calculator", "config": { "title": "...", "inputs": [{"name": "...", "label": "...", "default": 0}], "formula": "description of calculation" }}

For quiz:
{ "type": "quiz", "config": { "title": "...", "questions": [{"question": "...", "options": ["A", "B", "C", "D"], "correct": 0}] }}

For comparison_table:
{ "type": "comparison_table", "config": { "title": "...", "headers": ["Feature", "Option A", "Option B"], "rows": [["Feature 1", "Yes", "No"]] }}

For checklist:
{ "type": "checklist", "config": { "title": "...", "items": ["Item 1", "Item 2"] }}

If no component is appropriate, respond with: { "type": null }`;

        const response = await this.generateText(
            `Analyze this article and suggest an interactive component if appropriate:\n\nTopic: ${topic}\n\n${content.substring(0, 2000)}...`,
            systemInstruction
        );

        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                if (result.type === null) return null;
                return result;
            }
            return null;
        } catch (error) {
            this.logger.warn('Failed to parse component response', error);
            return null;
        }
    }

    /**
     * Stage 6: Final Review and Restructure Agent
     * Reviews the complete article and restructures for optimal reading experience
     */
    async finalReviewAndRestructure(content: string, topic: string): Promise<string> {
        const systemInstruction = `You are an elite editorial director. Your final pass must ensure the article is indistinguishable from top-tier human technical journalism while maximizing the user experience.

FINAL RESTRUCTURING PROTOCOL (ANTI-AI EDITION):
1. **ANTI-AI SCAN**: If any section feels like "standard AI" (too balanced, too generic, perfectly linear), rewrite it with more edge, expert character, and unique flow.
2. **MODERN FORMATTING**:
   - Compelling 📌 **Key Takeaways** box at the top.
   - TLDR style summaries for major sections.
   - Use bold for key terms and scannability.
3. **CALLOUT BOXES**: Use these exact formats to break up flow:
   > 💡 **Pro Tip:** [actionable technical insight]
   > ⚠️ **Watch Out:** [common mistake or edge case]
   > ✅ **Quick Win:** [an easy thing the reader can do right now]
   > 🎯 **Key Point:** [the must-know takeaway]
4. **HUMAN RHYTHM**: Ensure the transitions between ideas feel organic, like a human expert explaining a concept to a peer, rather than a pre-planned machine outline.
5. **EDITORIAL DESIGN**: Use em dashes (—) and ellipses (...) for more natural, stylized pauses.

CRITICAL: Preserve all original markdown image URLs (![...](link)) and the core H2/H3 structure.

OUTPUT: Return ONLY the polished markdown masterpiece.`;

        try {
            const response = await this.generateText(
                `Transform this article about "${topic}" into a modern, engaging masterpiece:\n\n${content}`,
                systemInstruction
            );

            // Clean the response
            let improved = response
                .replace(/^```markdown\n?/i, '')
                .replace(/^```\n?/, '')
                .replace(/\n?```$/g, '')
                .trim();

            this.logger.log(`Final review complete: ${improved.length} chars (was ${content.length})`);
            return improved;
        } catch (error) {
            this.logger.error('Final review failed', error);
            return content;
        }
    }

    /**
     * Generate SEO-optimized alt text for an image
     */
    async generateAltTags(prompt: string, topic: string): Promise<string> {
        try {
            const result = await this.generateText(
                `Write a concise, SEO-friendly alt text (max 10-15 words) for an image described as: "${prompt}". The article topic is "${topic}". Return ONLY the alt text, no quotes or labels.`
            );
            return result.trim();
        } catch (error) {
            // Fallback to a cleaned up version of the prompt if generation fails
            return prompt.split(':')[1]?.trim() || prompt;
        }
    }

    /**
     * Extract image prompts from content - finds unique prompts based on H2 sections
     */
    extractImagePrompts(content: string): { prompt: string; placeholder: string }[] {
        const results: { prompt: string; placeholder: string }[] = [];

        // Enhanced regex to handle:
        // 1. [IMAGE_PROMPT_1] <!-- Image: ... -->
        // 2. [IMAGE_PROMPT_1]: Prompt text
        // 3. [IMAGE_PROMPT_1] Prompt text
        // 4. Standalone [IMAGE_PROMPT_1]
        const promptRegex = /\[IMAGE_PROMPT_(\d+)\](?:\s*:\s*([^\n<]+)|(?:\s*<!--\s*Image:\s*([^-]+?)\s*-->))?/g;
        let match;

        while ((match = promptRegex.exec(content)) !== null) {
            const placeholderNum = match[1];
            // Prefer comment-based prompt, then colon-based prompt
            let prompt = (match[3] || match[2])?.trim();

            // If no specific prompt found, find the nearest H2 heading before this placeholder
            if (!prompt) {
                const contentBefore = content.substring(0, match.index);
                const h2Matches = contentBefore.match(/##\s+([^\n]+)/g);
                if (h2Matches && h2Matches.length > 0) {
                    const lastH2 = h2Matches[h2Matches.length - 1].replace(/^##\s+/, '');
                    prompt = `Illustration for: ${lastH2}`;
                } else {
                    prompt = `Blog section illustration ${placeholderNum}`;
                }
            }

            results.push({
                prompt,
                placeholder: `[IMAGE_PROMPT_${placeholderNum}]`,
            });
        }

        return results;
    }
}

