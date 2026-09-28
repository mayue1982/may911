'use strict';
// Node.js 22，可直接替换 FC 的 index.js。仅使用内置模块，无需安装依赖。
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const PROMPTS = {
  "sunny": "你是一位专业旅拍修图师。以输入原照片为唯一底图，仅编辑天气、颜色和受光，不重新设计场景。保留原构图、透视、地平线角度，以及所有实体的边界、数量、形状和位置。原图是海水的区域修后仍是海水，原图是天空的区域仍是天空；栏杆缝隙、人物两侧、画面边缘也必须保持原来背景类别。禁止把海面改成陆地、岸边、礁石或草丛；不得新增原图没有的植被、船、建筑、栏杆或其他物体，也不得删除原有物体和人物。保留人物五官、脸型、笑容、牙齿、眼镜、耳饰、发型、姿势、手臂轮廓与身体比例；服装条纹的走向、数量、褶皱与配饰保持原样，不美颜、不重新绘制服装或肢体。允许只改变与环境一致的亮度、白平衡和色彩，不用重绘细节来模拟光照。清除覆盖在画面上的平台水印和账号文字，仅在文字笔画及必要的窄边缘内修补，以紧邻区域的同类纹理填补；海水上的水印补海水，栏杆上的水印延续栏杆，不能借去水印新增岸线、植被或景物。保留真实招牌和衣服图案，不新增文字或水印。若氛围效果与场景结构保留冲突，优先保留结构。\n把阴天或灰天调整成明亮清甜的晴天旅拍。清澈饱满的天蓝色天空与自然柔软白云，天空到地平线过渡真实。海水更蓝、更清透，结合原有深浅呈现青蓝到深蓝的层次，保留浪花、反光、倒影与真实质感。去除灰色罩，提升中间调明亮度与色彩鲜活度。若原图有草地，仅让已有草地鲜绿明亮，不比原图更灰、更黄或更暗；没有草地则不生成草地。光线方向与原图相容，人物和地面受光协调，阴影合理，肤色自然、白衣干净。效果要清楚可见、有晴天的清新与甜美感，不是微弱去灰；自然饱和，不要荧光蓝、HDR光晕或高光溢出。",
  "sunset": "你是一位专业旅拍修图师。对这张原照片进行夕阳光色编辑。\n天空呈现清晰可见的暖金、蜜桃橙和柔粉晚霞，上方保留淡紫蓝层次；海面出现方向一致的金色反光，保留原有水纹与明暗层次。人物与环境的受光协调，肤色自然，衣服保留原来的颜色和细节，不使用整图橙色滤镜。不要添加太阳。\n保持原照片中所有人物和物体的数量、轮廓、位置、遮挡关系以及背景区域的类别不变，尤其保留画面底部和栏杆间隙中原有的内容。只改变光色，不新增、移除或替换实体，不改变构图。人物五官、表情、发型、服装与姿势保持一致。\n若存在叠加的平台水印，仅清理文字覆盖的小范围并延续紧邻纹理，不改动周围内容。输出真实、明亮、有明确夕阳氛围的摄影照片。"
};
const SUBJECT_RULE = '先核对原照片中的人物数量：纯风景照没有人物时，输出也必须完全无人；绝不可为了旅拍氛围凭空添加主角、游客、远处人影、剪影、倒影、人体局部或人形物。原图有人时，只保留原有人物及原来的位置、姿势和衣着。此要求优先于任何风格效果。\n';
const API_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
function fail(status, message, code) { return Object.assign(new Error(message), { status, code }); }
function endpoint(base) {
  let u;
  try { u = new URL(String(base).trim()); } catch { throw fail(503, 'DASHSCOPE_BASE_URL 格式错误：请只填写完整 HTTPS 地址，不要包含变量名、引号或 JSON', 'INVALID_BASE_URL'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw fail(503, 'DASHSCOPE_BASE_URL 必须为 HTTPS API 域名');
  if (!/^(?:dashscope(?:-intl|-us)?\.aliyuncs\.com|[\w.-]+\.maas\.aliyuncs\.com)$/.test(u.hostname)) throw fail(503, '请使用百炼官方 API 域名');
  const p = u.pathname.replace(/\/$/, '');
  if (p && p !== '/api/v1' && p !== '/compatible-mode/v1' && p !== API_PATH) throw fail(503, 'DASHSCOPE_BASE_URL 路径不正确');
  return u.origin + API_PATH;
}
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, '请求必须为 JSON 对象');
  if (!body.image) throw fail(400, '没有收到图片');
  if (!['sunny', 'sunset'].includes(body.mode)) throw fail(400, '当前仅支持晴空蓝海与自然黄昏');
  const match = typeof body.image === 'string' && body.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw fail(400, '图片必须为 JPG、PNG 或 WebP 的 Base64 Data URL');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.toString('base64') !== match[2]) throw fail(400, '图片 Base64 编码无效');
  if (bytes.length > 10 * 1024 * 1024) throw fail(413, '图片不能超过 10 MB');
  const valid = match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw fail(400, '图片内容与格式不符');
  const { width, height } = body;
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 30000) || width / height > 8 || height / width > 8) throw fail(400, '请提供有效图片尺寸，宽高比需在 1:8 至 8:1 之间');
  const scale = Math.sqrt(1024 * 1024 / (width * height));
  return `${Math.round(width * scale / 16) * 16}*${Math.round(height * scale / 16) * 16}`;
}
async function readLimited(stream, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > limit) throw fail(413, '数据过大，请缩小图片'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
function createApp({ env = process.env, fetchImpl = fetch } = {}) {
  let active = false;
  let freeCount = 0, freeDay = '', lastFreeAttempt = 0;
  const freeEnabled = env.FREE_PUBLIC_ENABLED === 'true';
  const parsedLimit = Number(env.FREE_INSTANCE_DAILY_LIMIT || 20);
  const freeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
  const origins = new Set((env.ALLOWED_ORIGINS || 'https://may911.top,https://www.may911.top,http://localhost:8080,http://127.0.0.1:8080').split(',').map(s => s.trim()).filter(Boolean));
  return http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return send(403, { ok: false, error: '当前网页来源未加入 ALLOWED_ORIGINS' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Token');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/') return send(200, { ok: true, message: '小麦岛AI修图服务运行正常', version: 'mvp-13-subject-guard', freeEnabled, modes: ['sunny', 'sunset'] });
    if (req.method !== 'POST' || !['/invoke', '/repair'].includes(path)) return send(404, { ok: false, error: '接口不存在' });
    if (!freeEnabled) {
      const secret = env.APP_ACCESS_TOKEN;
      if (!secret || secret.length < 24) return send(503, { ok: false, error: '免费体验暂未开放，请稍后再来' });
      const supplied = Buffer.from(req.headers['x-app-token'] || ''); const expected = Buffer.from(secret);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { ok: false, error: '免费体验暂未开放，请稍后再来' });
    }
    if (active) return send(429, { ok: false, error: '当前实例正在处理照片，请稍后重试' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { ok: false, error: '请发送 application/json' });
    active = true;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 165000);
    const disconnected = () => { if (!res.writableEnded) abort.abort(); };
    res.on('close', disconnected);
    try {
      let body;
      try { body = JSON.parse((await readLimited(req, 15 * 1024 * 1024)).toString('utf8')); } catch (err) { throw err.status ? err : fail(400, 'JSON 格式无效'); }
      const size = validate(body);
      if (!env.DASHSCOPE_API_KEY || !env.DASHSCOPE_BASE_URL) throw fail(503, '请配置 DASHSCOPE_API_KEY 和 DASHSCOPE_BASE_URL');
      const modelEndpoint = endpoint(env.DASHSCOPE_BASE_URL);
      if (freeEnabled) {
        const day = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
        if (freeDay !== day) { freeDay=day; freeCount=0; }
        if (freeCount >= freeLimit) throw fail(429, '本轮免费体验名额已用完，请稍后再来');
        if (Date.now()-lastFreeAttempt < 30000) throw fail(429, '体验请求较多，请等待30秒后再试');
        freeCount++; lastFreeAttempt=Date.now(); // 尝试调用即计数，包括失败，控制成本
      }
      const response = await fetchImpl(modelEndpoint, {
        method: 'POST', signal: abort.signal,
        headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen-image-3.0-pro', input: { messages: [{ role: 'user', content: [{ image: body.image }, { text: SUBJECT_RULE + PROMPTS[body.mode] }] }] }, parameters: { n: 1, size, watermark: false, prompt_extend: false } })
      });
      let result; try { result = await response.json(); } catch { throw fail(502, '千问服务未返回有效 JSON'); }
      if (!response.ok || result.code) throw fail(502, '千问调用失败，请核对百炼地域、模型权限及额度', typeof result.code === 'string' ? result.code : `HTTP_${response.status}`);
      const content = result.output?.choices?.[0]?.message?.content;
      const image = Array.isArray(content) && content.find(item => typeof item.image === 'string')?.image;
      if (!image) throw fail(502, '千问未返回图片');
      let url;
      try { url = new URL(image); } catch { throw fail(502, '千问返回的图片地址不是有效 URL', 'INVALID_RESULT_URL'); }
      // 仅下载模型返回的阿里云 OSS 图片；不提供客户端可任意调用的代理。
      if (url.protocol !== 'https:' || !/^[\w.-]+\.oss(?:-[\w-]+)?\.aliyuncs\.com$/.test(url.hostname)) throw fail(502, '结果图片地址不受支持');
      const download = await fetchImpl(url.href, { signal: abort.signal, redirect: 'error' });
      if (!download.ok) throw fail(502, '结果图片下载失败');
      const type = download.headers.get('content-type')?.split(';')[0];
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw fail(502, '结果格式不受支持');
      const bytes = await readLimited(download.body, 15 * 1024 * 1024);
      send(200, { ok: true, image: `data:${type};base64,${bytes.toString('base64')}`, requestId: result.request_id });
    } catch (err) {
      if (!res.destroyed) send(err.name === 'AbortError' ? 504 : err.status || 502, { ok: false, error: err.name === 'AbortError' ? '生成超时，请稍后重试' : err.status ? err.message : '后端请求失败，请检查网络或百炼配置', ...(err.code ? { code: err.code } : {}) });
    } finally { clearTimeout(timer); res.off('close', disconnected); active = false; }
  });
}
if (require.main === module) createApp().listen(9000, '0.0.0.0', () => console.log('小麦岛AI服务启动，端口：9000'));
module.exports = { createApp, validate, endpoint };

