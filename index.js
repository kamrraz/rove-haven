const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PAGE_ID = process.env.NOTION_PAGE_ID;
const NOTION_VERSION = '2022-06-28';
const PORT = process.env.PORT || 3000;

if (!NOTION_TOKEN) console.warn('WARNING: NOTION_TOKEN is not set!');
if (!PAGE_ID) console.warn('WARNING: NOTION_PAGE_ID is not set!');

const notionHeaders = () => ({
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json'
});

async function getBlockChildren(blockId) {
  const res = await fetch(
    `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`,
    { headers: notionHeaders() }
  );
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  return res.json();
}

app.get('/api/page', async (req, res) => {
  try {
    const data = await getBlockChildren(PAGE_ID);
    const sections = [];
    let currentSection = null;

    for (const block of data.results) {
      if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
        const richText = block[block.type].rich_text || [];
        const title = richText.map(t => t.plain_text).join('');
        currentSection = { title, items: [], fields: [] };
        sections.push(currentSection);
      } else if (block.type === 'to_do' && currentSection) {
        const richText = block.to_do.rich_text || [];
        const text = richText.map(t => t.plain_text).join('');
        currentSection.items.push({
          id: block.id,
          text,
          checked: block.to_do.checked
        });
      } else if (block.type === 'callout' && currentSection) {
        if (block.has_children) {
          const children = await getBlockChildren(block.id);
          for (const child of children.results) {
            if (child.type === 'paragraph') {
              const paraRich = child.paragraph.rich_text || [];
              const paraText = paraRich.map(t => t.plain_text).join('');
              const colonIdx = paraText.indexOf(':');
              if (colonIdx > 0) {
                const label = paraText.substring(0, colonIdx).trim();
                const value = paraText.substring(colonIdx + 1).trim();
                currentSection.fields.push({ fieldId: child.id, label, value });
              } else {
                currentSection.fields.push({ fieldId: child.id, label: paraText, value: '' });
              }
            }
          }
        } else {
          const richText = block.callout.rich_text || [];
          const label = richText.map(t => t.plain_text).join('');
          currentSection.fields.push({ fieldId: block.id, label, value: '' });
        }
      }
    }

    res.json({ sections });
  } catch (e) {
    console.error('GET /api/page error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/checkbox', async (req, res) => {
  const { blockId, checked } = req.body;
  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({ to_do: { checked } })
    });
    if (!response.ok) throw new Error(`Notion API error: ${response.status}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/checkbox error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/field', async (req, res) => {
  const { blockId, value } = req.body;
  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({
        paragraph: {
          rich_text: [{ type: 'text', text: { content: value } }]
        }
      })
    });
    if (!response.ok) throw new Error(`Notion API error: ${response.status}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/field error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/submit', async (req, res) => {
  const { unitNumber, fields, checkboxes } = req.body;
  try {
    const pageData = await getBlockChildren(PAGE_ID);
    const children = [];

    for (const block of pageData.results) {
      if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
        const richText = block[block.type].rich_text || [];
        const title = richText.map(t => t.plain_text).join('');
        children.push({
          object: 'block',
          type: block.type,
          [block.type]: {
            rich_text: [{ type: 'text', text: { content: title } }]
          }
        });
      } else if (block.type === 'to_do') {
        const richText = block.to_do.rich_text || [];
        const text = richText.map(t => t.plain_text).join('');
        children.push({
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [{ type: 'text', text: { content: text } }],
            checked: checkboxes && checkboxes[block.id] === true
          }
        });
      }
    }

    const fieldEntries = Object.entries(fields || {});
    if (fieldEntries.length > 0) {
      children.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: 'Submitted Fields' } }] }
      });
      for (const [, value] of fieldEntries) {
        if (value && value.trim()) {
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: value } }] }
          });
        }
      }
    }

    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { page_id: PAGE_ID },
        properties: {
          title: {
            title: [{ type: 'text', text: { content: `Unit ${unitNumber} - Rove Haven's Unit Onboarding` } }]
          }
        },
        children
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Create page failed: ${createRes.status} - ${errText}`);
    }

    for (const block of pageData.results) {
      if (block.type === 'to_do') {
        await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
          method: 'PATCH',
          headers: notionHeaders(),
          body: JSON.stringify({ to_do: { checked: false } })
        });
      } else if (block.type === 'callout' && block.has_children) {
        const calloutChildren = await getBlockChildren(block.id);
        for (const child of calloutChildren.results) {
          if (child.type === 'paragraph') {
            const richText = child.paragraph.rich_text || [];
            const text = richText.map(t => t.plain_text).join('');
            const colonIdx = text.indexOf(':');
            const label = colonIdx > 0 ? text.substring(0, colonIdx).trim() : text.trim();
            await fetch(`https://api.notion.com/v1/blocks/${child.id}`, {
              method: 'PATCH',
              headers: notionHeaders(),
              body: JSON.stringify({
                paragraph: {
                  rich_text: [{ type: 'text', text: { content: label + ':' } }]
                }
              })
            });
          }
        }
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/submit error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Rove Haven Checklist running on port ${PORT}`);
});
