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

function rt(t){return[{type:'text',text:{content:String(t)}}];}
function h2(t){return{object:'block',type:'heading_2',heading_2:{rich_text:rt(t)}};}
function todo(t,c){return{object:'block',type:'to_do',to_do:{rich_text:rt(t),checked:!!c}};}
function para(t){return{object:'block',type:'paragraph',paragraph:{rich_text:rt(t)}};}
function bullet(t){return{object:'block',type:'bulleted_list_item',bulleted_list_item:{rich_text:rt(t)}};}
function divider(){return{object:'block',type:'divider',divider:{}};}

app.post('/api/submit', async (req, res) => {
  const { unitNumber, sections, documents, inspection } = req.body;
  try {
    const date = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    const children = [];
    children.push(para(`Rove Haven Unit Onboarding - submitted ${date}`));
    children.push(divider());
    if (sections && Array.isArray(sections)) {
      for (const sec of sections) {
        children.push(h2(sec.title||'Section'));
        if(sec.items&&sec.items.length) for(const i of sec.items) children.push(todo(i.label,i.checked));
        if(sec.fields&&sec.fields.length) for(const f of sec.fields) {if(f.value&&String(f.value).trim()) children.push(para(`${f.label}: ${f.value}`));}
        if(sec.radios&&sec.radios.length) for(const r of sec.radios) children.push(para(`${r.label} ${r.value}`));
        children.push(divider());
      }
    }
    if(documents&&documents.length){
      children.push(h2('Landlord Documents'));
      for(const d of documents) children.push(bullet(`${d.uploaded?'Uploaded':'Pending'}: ${d.name}`));
      children.push(divider());
    }
    if(inspection){
      children.push(h2('Final Inspection'));
      children.push(para(`Status: ${inspection.status||'Not Set'}`));
      if(inspection.approver) children.push(para(`Approved by: ${inspection.approver}`));
    }
    const r = await fetch('https://api.notion.com/v1/pages',{
      method:'POST',
      headers:notionHeaders(),
      body:JSON.stringify({
        parent:{page_id:PAGE_ID},
        properties:{title:{title:[{type:'text',text:{content:`Unit ${unitNumber} - Rove Haven Onboarding`}}]}},
        children
      })
    });
    if(!r.ok){const e=await r.text();throw new Error(`${r.status} - ${e}`);}
    res.json({ok:true});
  } catch(e){
    console.error('submit error:',e.message);
    res.status(500).json({error:e.message});
  }
});

app.listen(PORT,()=>console.log(`Rove Haven running on port ${PORT}`));
