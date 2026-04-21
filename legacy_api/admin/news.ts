import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { mockNews } from '../_lib/fallbacks';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey || apiKey.includes('placeholder')) {
    return res.json(mockNews);
  }

  try {
    const response = await axios.get('https://newsdata.io/api/1/news', {
      params: {
        apikey: apiKey,
        q: 'Bangalore',
        country: 'in',
        category: 'environment,top,business',
      },
      timeout: 5000,
    });

    const items = (response.data?.results || []).slice(0, 5).map((item: any) => ({
      title: item.title,
      link: item.link,
      source_id: item.source_id,
      pubDate: item.pubDate,
      description: item.description || 'No description available.',
    }));

    return res.json(items.length > 0 ? items : mockNews);
  } catch (error) {
    return res.json(mockNews);
  }
}
