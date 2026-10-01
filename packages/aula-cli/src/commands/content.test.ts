import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, stat, rm, writeFile, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAllPages, contentDigest, integerFlag, trackRevisions, validateSnapshotArgs } from "../shared/content";
import { attachmentMetadata, downloadAttachment, validateMediaUrl, MAX_ATTACHMENT_BYTES, readLocalInput, extractAttachment } from "../shared/attachments";

describe("bounded content pagination", () => {
  test("continues past a short page to empty, deduplicates overlapping rows", async () => {
    const pages = [[{id:1}], [{id:1},{id:2}], []];
    const result = await collectAllPages(async page => ({ data: { posts: pages[page] } }), "posts", 0, 1, 4);
    expect(result.data.map(x => x.id)).toEqual([1,2]);
    expect(result.pagination.pagesFetched).toBe(3);
  });
  test("fails closed on repeated pages, unknown shapes, API errors and cap", async () => {
    await expect(collectAllPages(async () => ({data:[{id:1}]}), "posts", 0, 10, 3)).rejects.toThrow("repeated");
    await expect(collectAllPages(async () => ({data:{other:[]}}), "posts", 0, 10, 3)).rejects.toThrow("shape");
    await expect(collectAllPages(async () => ({status:{code:403},data:[]}), "posts", 0, 10, 3)).rejects.toThrow("error");
    await expect(collectAllPages(async n => ({data:[{id:n}]}), "posts", 0, 10, 3)).rejects.toThrow("limit");
    expect(() => integerFlag(["--limit=10oops"], "limit", 10)).toThrow();
  });
});
describe("revision detection", () => {
  test("requires an explicit account namespace before any fetch", () => {
    expect(() => validateSnapshotArgs(["--snapshot=file.json"])).toThrow("unique-stable");
    expect(() => validateSnapshotArgs(["--snapshot=file.json", "--snapshot-account=parent-a"])).not.toThrow();
  });
  test("text and attachment identity changes count; signed URL expiry does not", () => {
    const row = {content:{html:"hello"}, attachments:[{url:"https://media-prod.aula.dk/file.pdf?signature=one"}]};
    expect(contentDigest(row)).toBe(contentDigest({...row, attachments:[{url:"https://media-prod.aula.dk/file.pdf?signature=two"}]}));
    expect(contentDigest(row)).not.toBe(contentDigest({...row, content:{html:"edited"}}));
    expect(contentDigest(row)).not.toBe(contentDigest({...row, attachments:[{url:"https://media-prod.aula.dk/replaced.pdf"}]}));
  });
  test("snapshots are private, scoped, and retain older rows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aula-revisions-"));
    try {
      const path = join(dir,"snapshot.json");
      const first: any = await trackRevisions({data:[{id:1,text:"a"}]}, "messages", [`--snapshot=${path}`, "--snapshot-account=test"], "thread:1");
      expect(first.revisions.changes).toEqual([{id:"1",change:"new"}]);
      const second: any = await trackRevisions({data:[{id:1,text:"b"},{id:2,text:"x"}]}, "messages", [`--snapshot=${path}`, "--snapshot-account=test"], "thread:1");
      expect(second.revisions.changes).toEqual([{id:"1",change:"changed"},{id:"2",change:"new"}]);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      await expect(trackRevisions({data:[]}, "messages", [`--snapshot=${path}`, "--snapshot-account=other"], "thread:1")).rejects.toThrow("scope");
      await expect(trackRevisions({data:[]}, "messages", [`--snapshot=${path}`, "--snapshot-account=test"], "thread:2")).rejects.toThrow("scope");
      expect((await readFile(path,"utf8"))).not.toContain('"text"');
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
});
describe("attachments", () => {
  test("rejects hostile destinations", () => {
    for (const url of ["https://evil.test/x", "http://media-prod.aula.dk/x", "https://media-prod.aula.dk.evil.test/x", "https://user@media-prod.aula.dk/x", "https://media-prod.aula.dk:444/x", "https://media-prod.aula.dk/x#fragment"]) expect(() => validateMediaUrl(url)).toThrow();
  });
  test("downloads with no credentials, blocks redirects, stores private random name and hash", async () => {
    const dir = await mkdtemp(join(await realpath(tmpdir()),"aula-media-"));
    try {
      let options: RequestInit | undefined;
      const fake = (async (_url: unknown, init: RequestInit) => {options=init;return new Response("sample",{headers:{"content-disposition":"attachment; filename=../../bad"}});}) as unknown as typeof fetch;
      const result = await downloadAttachment("https://media-prod.aula.dk/file?sig=secret",dir,fake);
      expect(options?.redirect).toBe("error");
      expect(options?.credentials).toBe("omit");
      expect(new Headers(options?.headers).has("cookie")).toBe(false);
      expect(new Headers(options?.headers).has("authorization")).toBe(false);
      expect(await readFile(result.path,"utf8")).toBe("sample");
      expect(result.sha256).toHaveLength(64);
      expect((await stat(result.path)).mode & 0o777).toBe(0o600);
      expect(JSON.stringify(result)).not.toContain("secret");
      await expect(downloadAttachment("https://media-prod.aula.dk/file",dir,(async()=>new Response("x",{headers:{"content-length":String(MAX_ATTACHMENT_BYTES+1)}})) as unknown as typeof fetch)).rejects.toThrow("large");
      await expect(downloadAttachment("https://media-prod.aula.dk/file",dir,(async()=>{throw new Error("secret URL")}) as unknown as typeof fetch)).rejects.toThrow("suppressed");
    } finally {await rm(dir,{recursive:true,force:true});}
  });
  test("extracts metadata without assuming URL property names; rejects symlink input/output", async () => {
    expect(attachmentMetadata({data:[{id:1,attachments:[{id:9,downloadUrl:"opaque"}]}]})).toHaveLength(1);
    const dir = await mkdtemp(join(await realpath(tmpdir()),"aula-input-"));
    try {
      await writeFile(join(dir,"file"),"not PDF");
      await symlink(join(dir,"file"),join(dir,"link"));
      await symlink(dir,join(dir,"dir-link"));
      await expect(readLocalInput(join(dir,"link"))).rejects.toThrow();
      await expect(extractAttachment(join(dir,"file"))).rejects.toThrow("PDF");
      await expect(downloadAttachment("https://media-prod.aula.dk/file",join(dir,"dir-link","nested"))).rejects.toThrow("Symlink");
    } finally {await rm(dir,{recursive:true,force:true});}
  });
});

test("streamed attachment size limits remove partial files", async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), "aula-stream-"));
  try {
    const fetcher = (async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_ATTACHMENT_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      }
    }))) as unknown as typeof fetch;
    await expect(downloadAttachment("https://media-prod.aula.dk/file", directory, fetcher)).rejects.toThrow("partial file removed");
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("verified attachment metadata and comments methods", () => {
  test("resolves ordinary and media URLs; rejects unsafe or distinct types", async () => {
    const { resolveAttachment, selectAttachment } = await import("../shared/attachments");
    const safe = {id:42,status:"available",file:{url:"https://media-prod.aula.dk/a",scanningStatus:"available"}};
    expect(resolveAttachment(safe).id).toBe("42");
    expect(resolveAttachment({id:43,status:"available",media:{file:{url:"https://media-prod.aula.dk/b"}}}).id).toBe("43");
    for (const patch of [{status:"pending"},{link:{url:"https://example.org"}},{document:{canAccess:true}},{scanningStatus:"blocked"},{scanningStatus:"unknown"},{file:{...safe.file,scanningStatus:"processing"}}]) expect(() => resolveAttachment({...safe,...patch})).toThrow();
    expect(selectAttachment({attachments:[safe]},"42").url).toBe(safe.file.url);
    expect(() => selectAttachment({attachments:[safe,safe]},"42")).toThrow();
    expect(() => selectAttachment({attachments:[safe]},"99")).toThrow();
  });
  test("client uses verified GET v24 comments and post-detail parameters", async () => {
    const { createV23ReadClient } = await import("../../../aula-api-client/src/endpoints/v23");
    const calls: any[] = [];
    const client = createV23ReadClient({request: async <T>(config: any) => {calls.push(config);return {data:[]} as T;}});
    await client.getPost(42);
    await client.getComments({parentId:42,parentType:"Post",startIndex:5,limit:5});
    expect(calls[0]).toMatchObject({method:"GET",path:"/api/v24/",query:{method:"posts.getById",id:42}});
    expect(calls[1]).toMatchObject({method:"GET",path:"/api/v24/",query:{method:"comments.getComments",parentId:42,parentType:"Post",startIndex:5,limit:5,includeReportedComments:false}});
  });
  test("comments pagination supports source-proven response envelope", async () => {
    const result = await collectAllPages(async index => ({status:{code:0},data:{comments:index === 0 ? [{id:3,content:"sanitized"}] : [],totalResultCount:1,commentableInstitutionProfiles:[]}}),"comments",0,5,10);
    expect(result.data.map(row => row.id)).toEqual([3]);
  });
});


test("single post identity and targeted message lookup are bounded", async () => {
  const { singlePost, findMessage } = await import("../shared/content");
  expect(singlePost({data:{id:42,title:"fixture"}},42).id).toBe(42);
  expect(() => singlePost({data:{id:43}},42)).toThrow("identity");
  expect(() => singlePost({data:{id:{}}},42)).toThrow("identity");
  let calls = 0;
  const found = await findMessage(async page => {calls++;return {data:{messages:page === 0 ? [{id:"first"}] : [{id:"abc.123"}]}};},"abc.123",3);
  expect(found.id).toBe("abc.123");
  expect(calls).toBe(2);
  await expect(findMessage(async () => ({data:[{id:"other"}]}),"missing",3)).rejects.toThrow("repeated");
});


test("source-proven pagination completion flags avoid extra requests", async () => {
  const result = await collectAllPages(async () => ({data:{posts:[{id:1}],hasMorePosts:false}}),"posts",0,10,1);
  expect(result.pagination.complete).toBe(true);
  expect(result.pagination.pagesFetched).toBe(1);
  await expect(collectAllPages(async () => ({data:{threads:[],moreMessagesExist:true}}),"threads",0,1,1)).rejects.toThrow("empty page");
});

test.skipIf(!Bun.which("python3"))("DOCX extraction preserves rows and cells and rejects unsafe archives", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aula-docx-"));
  const create = (mode: string) => {
    const script = `import io,sys,zipfile
b=io.BytesIO()
xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Schedule</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Monday</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Forest walk</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
mode=sys.argv[1]
with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types/>')
 z.writestr('word/document.xml',('x'*(8*1024*1024+1)) if mode=='oversize' else xml)
 if mode=='traversal':z.writestr('../bad','bad')
sys.stdout.buffer.write(b.getvalue())`;
    const result = Bun.spawnSync(["python3", "-c", script, mode]);
    if (result.exitCode !== 0) throw new Error("Fixture creation failed");
    return result.stdout;
  };
  try {
    const path = join(dir, "fixture.docx");
    await writeFile(path, create("safe"));
    const extracted = await extractAttachment(path);
    expect(extracted.text).toContain("Schedule\nTable row 1\n  Cell 1:\n    Monday\n  Cell 2:\n    Forest walk");
    expect(extracted.noExtractableText).toBe(false);
    await writeFile(path, create("traversal"));
    await expect(extractAttachment(path)).rejects.toThrow("Document extraction failed");
    await writeFile(path, create("oversize"));
    await expect(extractAttachment(path)).rejects.toThrow("Document extraction failed");
  } finally { await rm(dir, {recursive:true,force:true}); }
});
