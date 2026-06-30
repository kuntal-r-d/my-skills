import type { Db } from '@stock-buddy/db';
import {
  addToWatchlist,
  ensureTicker,
  getDefaultAccount,
  getFreshness,
  getLatestFundamentals,
  getLatestMacro,
  getNews,
  getOhlcv,
  getPortfolioPositions,
  getResearchMemo,
  getResearchSources,
  getShareholding,
  deleteSkillOverride,
  getSkillOverride,
  linkResearchSourcesToMemo,
  listResearchMemos,
  listSkillOverrides,
  getTickerBySymbol,
  listTickers,
  removePosition,
  setAccount,
  upsertPosition,
  upsertResearchMemo,
  upsertResearchSources,
  upsertShareholding,
  upsertSkillOverride,
} from '@stock-buddy/db';
import {
  buildTickerContract,
  stripMeta,
  ingestAll,
  ingestOhlcv,
} from '@stock-buddy/ingest';
import {
  buildClientResearchInstructions,
  CORE_CONTRACT_FIELDS,
  getMergedSkill,
  listMergedSkills,
  listSkillSlugsFromDisk,
  parseSkillMd,
  validateSkillSlug,
  writeSkillToDisk,
  SKILL_TOOL_NAMES,
} from '@stock-buddy/core';

function isAdmin(): boolean {
  return process.env.STOCK_BUDDY_DATA_ADMIN === '1';
}

function isSkillsAdmin(): boolean {
  return isAdmin() || process.env.STOCK_BUDDY_SKILLS_ADMIN === '1';
}

function canWriteSkillsDisk(): boolean {
  return isSkillsAdmin() && process.env.STOCK_BUDDY_SKILLS_WRITE_DISK !== '0';
}

function formatSkillDetail(
  detail: NonNullable<ReturnType<typeof getMergedSkill>>,
  overrideRow?: Awaited<ReturnType<typeof getSkillOverride>> | null,
) {
  return {
    slug: detail.slug,
    tool_name: detail.tool_name,
    name: detail.name,
    description: detail.description,
    source: detail.source,
    has_disk: detail.has_disk,
    has_override: detail.has_override,
    is_active: detail.is_active,
    version: detail.version,
    updated_at: detail.updated_at,
    skill_md_length: detail.skill_md_length,
    skill_md: detail.skill_md,
    disk_skill_md: detail.disk_skill_md,
    override_id: detail.override_id ?? overrideRow?.id ?? null,
    metadata_json: overrideRow?.metadataJson ?? null,
  };
}

function formatResearchSourceRow(
  r: Awaited<ReturnType<typeof getResearchSources>>[number],
  symbolById: Map<number, string>,
) {
  return {
    id: r.id,
    memo_id: r.memoId,
    ticker: r.tickerId != null ? symbolById.get(r.tickerId) ?? null : null,
    url: r.url,
    title: r.title,
    publisher: r.publisher,
    published_date: r.publishedDate,
    fetched_at: r.fetchedAt,
    query_context: r.queryContext,
    category: r.category,
    extracted_facts: r.extractedFacts,
    session_id: r.sessionId,
    client_id: r.clientId,
    notes: r.notes,
  };
}

function formatResearchMemoRow(
  row: Awaited<ReturnType<typeof getResearchMemo>>,
  symbol?: string,
  includeBody = true,
) {
  if (!row) return null;
  const base = {
    id: row.id,
    ticker: symbol ?? null,
    session_id: row.sessionId,
    client_id: row.clientId,
    title: row.title,
    as_of: row.asOf,
    version: row.version,
    parent_memo_id: row.parentMemoId,
    summary_json: row.summaryJson,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
  if (includeBody) {
    return { ...base, body_md: row.bodyMd, body_md_length: row.bodyMd.length };
  }
  return { ...base, body_md_length: row.bodyMd.length };
}

export async function handleDataTool(
  db: Db,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'get_ticker_contract': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      if (!ticker) return { error: 'ticker required' };
      const t = await getTickerBySymbol(db, ticker);
      if (!t) {
        return {
          error: `Unknown ticker: ${ticker}`,
          instructions: buildClientResearchInstructions({
            ticker,
            missingFields: [...CORE_CONTRACT_FIELDS],
            reason: 'incomplete_contract',
          }),
        };
      }
      const contract = await buildTickerContract(db, ticker, {
        mode: (args.mode as 'momentum' | 'investment') ?? 'investment',
        ohlcvDays: args.ohlcv_days ? Number(args.ohlcv_days) : 260,
        includePortfolio: Boolean(args.include_portfolio),
      });
      return contract;
    }

    case 'get_ticker_contract_for_analysis': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      if (!ticker) return { error: 'ticker required' };
      const t = await getTickerBySymbol(db, ticker);
      if (!t) {
        return {
          error: `Unknown ticker: ${ticker}`,
          instructions: buildClientResearchInstructions({
            ticker,
            missingFields: [...CORE_CONTRACT_FIELDS],
            reason: 'incomplete_contract',
          }),
        };
      }
      const contract = await buildTickerContract(db, ticker, {
        mode: (args.mode as 'momentum' | 'investment') ?? 'investment',
        ohlcvDays: args.ohlcv_days ? Number(args.ohlcv_days) : 260,
        includePortfolio: Boolean(args.include_portfolio),
      });
      return stripMeta(contract);
    }

    case 'get_ohlcv': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return { error: `Unknown ticker: ${ticker}` };
      const rows = await getOhlcv(db, t.id, {
        start: args.start ? String(args.start) : undefined,
        end: args.end ? String(args.end) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });
      return {
        ticker,
        ohlcv: rows.map((r) => ({
          date: r.tradeDate,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volume: r.volume,
        })),
      };
    }

    case 'get_fundamentals': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return { error: `Unknown ticker: ${ticker}` };
      const snap = await getLatestFundamentals(db, t.id);
      return { ticker, fundamentals: snap?.payload ?? null, as_of: snap?.asOf, source: snap?.source };
    }

    case 'get_shareholding': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const months = args.months ? Number(args.months) : 4;
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return { error: `Unknown ticker: ${ticker}` };
      const rows = await getShareholding(db, t.id, months);
      return {
        ticker,
        shareholding: rows.map((r) => ({
          month: String(r.month).slice(0, 7),
          sponsor: r.sponsor,
          govt: r.govt,
          institution: r.institution,
          foreign: r.foreign,
          public: r.public,
        })),
      };
    }

    case 'get_macro': {
      const snap = await getLatestMacro(db);
      return { macro: snap?.payload ?? null, as_of: snap?.asOf, source: snap?.source };
    }

    case 'get_news': {
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      const days = args.days ? Number(args.days) : 7;
      let tickerId: number | undefined;
      if (ticker) {
        const t = await getTickerBySymbol(db, ticker);
        if (!t) return { error: `Unknown ticker: ${ticker}` };
        tickerId = t.id;
      }
      const rows = await getNews(db, tickerId, days);
      return {
        news: rows.map((n) => ({
          date: n.publishedDate,
          headline: n.headline,
          source: n.source,
          category: n.category,
        })),
      };
    }

    case 'get_data_status': {
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      let tickerId: number | undefined;
      if (ticker) {
        const t = await getTickerBySymbol(db, ticker);
        if (!t) return { error: `Unknown ticker: ${ticker}` };
        tickerId = t.id;
      }
      const rows = await getFreshness(db, tickerId);
      return {
        freshness: rows.map((f) => ({
          entity_type: f.entityType,
          last_success_at: f.lastSuccessAt,
          last_attempt_at: f.lastAttemptAt,
          stale_after_hours: f.staleAfterHours,
        })),
      };
    }

    case 'list_tickers': {
      const rows = await listTickers(db);
      return { tickers: rows.map((t) => ({ symbol: t.symbol, name: t.name, sector: t.sector })) };
    }

    case 'get_portfolio': {
      const account = await getDefaultAccount(db);
      if (!account) return { error: 'No portfolio account configured' };
      const positions = await getPortfolioPositions(db, account.id);
      const totalValue = positions.reduce((s, p) => s + p.position.qty * p.position.avgCost, 0);
      return {
        account: {
          capital_bdt: account.capitalBdt,
          risk_per_trade_pct: account.riskPerTradePct,
          label: account.label,
        },
        portfolio: {
          total_value_bdt: totalValue || account.capitalBdt,
          positions: positions.map((p) => ({
            ticker: p.symbol,
            qty: p.position.qty,
            price: p.position.avgCost,
            sector: p.position.sector,
            stop_level: p.position.stopLevel,
            target_level: p.position.targetLevel,
          })),
        },
      };
    }

    case 'upsert_position': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const qty = Number(args.qty);
      const avgCost = Number(args.avg_cost ?? args.price);
      if (!ticker || Number.isNaN(qty) || Number.isNaN(avgCost)) {
        return { error: 'ticker, qty, and avg_cost required' };
      }
      const account = await getDefaultAccount(db);
      if (!account) return { error: 'No portfolio account' };
      const t = await ensureTicker(db, ticker, { sector: args.sector ? String(args.sector) : undefined });
      await upsertPosition(db, account.id, t.id, {
        qty,
        avgCost,
        sector: args.sector ? String(args.sector) : t.sector ?? undefined,
        stopLevel: args.stop_level != null ? Number(args.stop_level) : undefined,
        targetLevel: args.target_level != null ? Number(args.target_level) : undefined,
      });
      return { ok: true, ticker, qty, avg_cost: avgCost };
    }

    case 'remove_position': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const account = await getDefaultAccount(db);
      const t = await getTickerBySymbol(db, ticker);
      if (!account || !t) return { error: 'Account or ticker not found' };
      await removePosition(db, account.id, t.id);
      return { ok: true, removed: ticker };
    }

    case 'set_account': {
      const account = await getDefaultAccount(db);
      if (!account) return { error: 'No portfolio account' };
      await setAccount(db, account.id, {
        capitalBdt: args.capital_bdt != null ? Number(args.capital_bdt) : undefined,
        riskPerTradePct: args.risk_per_trade_pct != null ? Number(args.risk_per_trade_pct) : undefined,
        label: args.label != null ? String(args.label) : undefined,
      });
      return { ok: true };
    }

    case 'trigger_ingest': {
      if (!isAdmin()) return { error: 'Admin tools disabled. Set STOCK_BUDDY_DATA_ADMIN=1' };
      const ticker = String(args.ticker ?? '').toUpperCase();
      const job = String(args.job ?? 'all');
      const days = args.days ? Number(args.days) : 365;
      if (job === 'ohlcv') {
        const n = await ingestOhlcv(db, ticker, days);
        return { ok: true, rows: n };
      }
      await ingestAll(db, ticker, days);
      return { ok: true, ticker, job };
    }

    case 'register_ticker': {
      if (!isAdmin()) return { error: 'Admin tools disabled. Set STOCK_BUDDY_DATA_ADMIN=1' };
      const ticker = String(args.ticker ?? '').toUpperCase();
      const t = await ensureTicker(db, ticker, {
        name: args.name ? String(args.name) : undefined,
        sector: args.sector ? String(args.sector) : undefined,
      });
      await addToWatchlist(db, t.id);
      return { ok: true, symbol: t.symbol };
    }

    case 'upsert_research_sources': {
      const sources = args.sources;
      if (!Array.isArray(sources) || sources.length === 0) {
        return { error: 'sources array required (one or more citation objects)' };
      }

      let tickerId: number | null = null;
      const tickerArg = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      if (tickerArg) {
        const t = await getTickerBySymbol(db, tickerArg);
        if (!t) return { error: `Unknown ticker: ${tickerArg}. Use register_ticker first.` };
        tickerId = t.id;
      }

      const parsed: Array<{
        url?: string;
        title: string;
        publisher?: string;
        publishedDate?: string;
        category?: string;
        extractedFacts?: Record<string, unknown>;
        notes?: string;
      }> = [];

      for (const raw of sources) {
        const s = raw as Record<string, unknown>;
        const title = String(s.title ?? s.headline ?? '').trim();
        if (!title) return { error: 'Each source needs title or headline' };
        parsed.push({
          url: s.url ? String(s.url) : undefined,
          title,
          publisher: s.publisher ? String(s.publisher) : s.source ? String(s.source) : undefined,
          publishedDate: s.published_date ? String(s.published_date) : s.date ? String(s.date) : undefined,
          category: s.category ? String(s.category) : undefined,
          extractedFacts:
            s.extracted_facts && typeof s.extracted_facts === 'object'
              ? (s.extracted_facts as Record<string, unknown>)
              : undefined,
          notes: s.notes ? String(s.notes) : undefined,
        });
      }

      const result = await upsertResearchSources(db, parsed, {
        tickerId,
        memoId: args.memo_id != null ? Number(args.memo_id) : undefined,
        sessionId: args.session_id ? String(args.session_id) : undefined,
        clientId: args.client_id ? String(args.client_id) : undefined,
        queryContext: args.query_context ? String(args.query_context) : undefined,
      });

      let shareholdingPromoted: Record<string, unknown> | undefined;
      const promote = args.promote_shareholding as Record<string, unknown> | undefined;
      if (promote && tickerId != null) {
        const month = String(promote.month ?? '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) {
          return { error: 'promote_shareholding.month must be YYYY-MM when promoting shareholding' };
        }
        await upsertShareholding(db, tickerId, `${month}-01`, {
          sponsor: promote.sponsor != null ? Number(promote.sponsor) : undefined,
          govt: promote.govt != null ? Number(promote.govt) : undefined,
          institution: promote.institution != null ? Number(promote.institution) : undefined,
          foreign: promote.foreign != null ? Number(promote.foreign) : undefined,
          public: promote.public != null ? Number(promote.public) : undefined,
          source: promote.source ? String(promote.source) : 'research',
        });
        shareholdingPromoted = { month, ticker: tickerArg };
      }

      return {
        ok: true,
        ticker: tickerArg ?? null,
        inserted: result.inserted,
        updated: result.updated,
        ids: result.ids,
        shareholding_promoted: shareholdingPromoted ?? null,
      };
    }

    case 'get_research_sources': {
      let tickerId: number | undefined;
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      if (ticker) {
        const t = await getTickerBySymbol(db, ticker);
        if (!t) return { error: `Unknown ticker: ${ticker}` };
        tickerId = t.id;
      }

      const rows = await getResearchSources(db, {
        tickerId,
        memoId: args.memo_id != null ? Number(args.memo_id) : undefined,
        sessionId: args.session_id ? String(args.session_id) : undefined,
        category: args.category ? String(args.category) : undefined,
        days: args.days ? Number(args.days) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });

      const symbolById = new Map<number, string>();
      if (rows.some((r) => r.tickerId != null)) {
        const all = await listTickers(db);
        for (const t of all) symbolById.set(t.id, t.symbol);
      }

      return {
        research_sources: rows.map((r) => formatResearchSourceRow(r, symbolById)),
      };
    }

    case 'upsert_research_memo': {
      const bodyMd = String(args.body_md ?? '').trim();
      const title = String(args.title ?? '').trim();
      if (!bodyMd) return { error: 'body_md required' };
      if (!title) return { error: 'title required' };

      let tickerId: number | null = null;
      const tickerArg = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      if (tickerArg) {
        const t = await getTickerBySymbol(db, tickerArg);
        if (!t) return { error: `Unknown ticker: ${tickerArg}. Use register_ticker first.` };
        tickerId = t.id;
      }

      const summaryJson =
        args.summary_json && typeof args.summary_json === 'object'
          ? (args.summary_json as Record<string, unknown>)
          : undefined;

      const result = await upsertResearchMemo(
        db,
        {
          tickerId,
          sessionId: args.session_id ? String(args.session_id) : undefined,
          clientId: args.client_id ? String(args.client_id) : undefined,
          title,
          bodyMd,
          summaryJson,
          asOf: args.as_of ? String(args.as_of) : undefined,
          parentMemoId: args.parent_memo_id != null ? Number(args.parent_memo_id) : undefined,
        },
        {
          memoId: args.memo_id != null ? Number(args.memo_id) : undefined,
          linkSessionSources: args.link_session_sources !== false,
        },
      );

      let extraLinked = 0;
      if (args.link_source_ids && Array.isArray(args.link_source_ids)) {
        extraLinked = await linkResearchSourcesToMemo(db, result.id, {
          sourceIds: args.link_source_ids.map((id) => Number(id)),
        });
      }
      if (args.link_all_ticker_sources && tickerId != null) {
        extraLinked += await linkResearchSourcesToMemo(db, result.id, { tickerId });
      }

      return {
        ok: true,
        memo_id: result.id,
        version: result.version,
        ticker: tickerArg ?? null,
        sources_linked: result.sources_linked + extraLinked,
        body_md_length: bodyMd.length,
      };
    }

    case 'get_research_memo': {
      let tickerId: number | undefined;
      let symbol: string | undefined;
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      if (ticker) {
        const t = await getTickerBySymbol(db, ticker);
        if (!t) return { error: `Unknown ticker: ${ticker}` };
        tickerId = t.id;
        symbol = t.symbol;
      }

      const includeBody = args.include_body !== false;
      const row = await getResearchMemo(db, {
        id: args.memo_id != null ? Number(args.memo_id) : undefined,
        tickerId,
        sessionId: args.session_id ? String(args.session_id) : undefined,
        includeBody,
      });

      if (!row) return { error: 'Research memo not found' };

      let sources: ReturnType<typeof formatResearchSourceRow>[] = [];
      if (args.include_sources) {
        const sourceRows = await getResearchSources(db, { memoId: row.id, days: 3650, limit: 200 });
        const symbolById = new Map<number, string>();
        if (symbol) symbolById.set(tickerId!, symbol);
        sources = sourceRows.map((r) => formatResearchSourceRow(r, symbolById));
      }

      return {
        research_memo: formatResearchMemoRow(row, symbol, includeBody),
        research_sources: args.include_sources ? sources : undefined,
      };
    }

    case 'list_research_memos': {
      let tickerId: number | undefined;
      let symbol: string | undefined;
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      if (ticker) {
        const t = await getTickerBySymbol(db, ticker);
        if (!t) return { error: `Unknown ticker: ${ticker}` };
        tickerId = t.id;
        symbol = t.symbol;
      }

      const rows = await listResearchMemos(db, {
        tickerId,
        limit: args.limit ? Number(args.limit) : undefined,
        includeBody: args.include_body === true,
      });

      return {
        research_memos: rows.map((row) => {
          const memo = row as Awaited<ReturnType<typeof listResearchMemos>>[number] & { bodyMd?: string };
          if ('bodyMd' in memo && memo.bodyMd) {
            return formatResearchMemoRow(memo as NonNullable<Awaited<ReturnType<typeof getResearchMemo>>>, symbol, true);
          }
          return {
            id: memo.id,
            ticker: symbol ?? null,
            session_id: memo.sessionId,
            title: memo.title,
            as_of: memo.asOf,
            version: memo.version,
            body_md_length: (memo as { body_md_length?: number }).body_md_length ?? null,
            created_at: memo.createdAt,
            updated_at: memo.updatedAt,
          };
        }),
      };
    }

    case 'list_skills': {
      const diskSlugs = listSkillSlugsFromDisk();
      const overrides = await listSkillOverrides(db);
      const skills = listMergedSkills(diskSlugs, overrides, {
        include_skill_md: args.include_skill_md === true,
      });
      return {
        skills,
        skills_dir: process.env.STOCK_BUDDY_SKILLS_DIR ?? 'skills/',
        count: skills.length,
      };
    }

    case 'get_skill': {
      const slug = String(args.slug ?? args.skill ?? '').trim();
      if (!slug) return { error: 'slug required' };
      try {
        validateSkillSlug(slug);
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
      const override = await getSkillOverride(db, slug);
      const detail = getMergedSkill(slug, override, {
        include_disk_copy: args.include_disk_copy === true,
      });
      if (!detail) return { error: `Skill not found: ${slug}` };
      return { skill: formatSkillDetail(detail, override) };
    }

    case 'upsert_skill': {
      if (!isSkillsAdmin()) {
        return { error: 'Skill write disabled. Set STOCK_BUDDY_SKILLS_ADMIN=1 or STOCK_BUDDY_DATA_ADMIN=1' };
      }
      const slug = String(args.slug ?? args.skill ?? '').trim();
      const skillMd = String(args.skill_md ?? '').trim();
      if (!slug) return { error: 'slug required' };
      if (!skillMd) return { error: 'skill_md required (full SKILL.md with frontmatter)' };
      try {
        validateSkillSlug(slug);
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }

      const parsed = parseSkillMd(skillMd);
      const row = await upsertSkillOverride(db, {
        slug,
        skillMd,
        toolName: args.tool_name ? String(args.tool_name) : SKILL_TOOL_NAMES[slug],
        name: args.name ? String(args.name) : parsed.name ?? undefined,
        description: args.description ? String(args.description) : parsed.description ?? undefined,
        metadataJson:
          args.metadata_json && typeof args.metadata_json === 'object'
            ? (args.metadata_json as Record<string, unknown>)
            : undefined,
        isActive: args.is_active !== false,
        clientId: args.client_id ? String(args.client_id) : undefined,
      });

      let diskPath: string | undefined;
      if (args.sync_to_disk === true) {
        if (!canWriteSkillsDisk()) {
          return {
            error: 'sync_to_disk blocked. Set STOCK_BUDDY_SKILLS_WRITE_DISK=1 (and admin flag)',
            override_id: row.id,
            version: row.version,
          };
        }
        diskPath = writeSkillToDisk(slug, skillMd).path;
      }

      const detail = getMergedSkill(slug, row, { include_disk_copy: true });
      return {
        ok: true,
        override_id: row.id,
        version: row.version,
        slug,
        synced_to_disk: Boolean(diskPath),
        disk_path: diskPath,
        skill: detail ? formatSkillDetail(detail, row) : undefined,
      };
    }

    case 'reset_skill': {
      if (!isSkillsAdmin()) {
        return { error: 'Skill write disabled. Set STOCK_BUDDY_SKILLS_ADMIN=1 or STOCK_BUDDY_DATA_ADMIN=1' };
      }
      const slug = String(args.slug ?? args.skill ?? '').trim();
      if (!slug) return { error: 'slug required' };
      const removed = await deleteSkillOverride(db, slug);
      if (!removed) return { error: `No DB override for skill: ${slug}` };
      const detail = getMergedSkill(slug, null, { include_disk_copy: true });
      return {
        ok: true,
        slug,
        reverted_to: detail?.source ?? 'disk',
        skill: detail ? formatSkillDetail(detail, null) : null,
      };
    }

    case 'sync_skill_to_disk': {
      if (!isSkillsAdmin()) {
        return { error: 'Skill write disabled. Set STOCK_BUDDY_SKILLS_ADMIN=1 or STOCK_BUDDY_DATA_ADMIN=1' };
      }
      if (!canWriteSkillsDisk()) {
        return { error: 'Disk write disabled. Set STOCK_BUDDY_SKILLS_WRITE_DISK=1' };
      }
      const slug = String(args.slug ?? args.skill ?? '').trim();
      if (!slug) return { error: 'slug required' };
      const override = await getSkillOverride(db, slug);
      const detail = getMergedSkill(slug, override, { include_disk_copy: false });
      if (!detail) return { error: `Skill not found: ${slug}` };
      const { path: diskPath } = writeSkillToDisk(slug, detail.skill_md);
      return { ok: true, slug, disk_path: diskPath, source: detail.source };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export const DATA_TOOLS = [
  {
    name: 'get_ticker_contract',
    description: 'Full analysis-ready data contract for a DSE ticker (includes _meta freshness).',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        mode: { type: 'string', enum: ['investment', 'momentum'] },
        include_portfolio: { type: 'boolean' },
        ohlcv_days: { type: 'number' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'get_ticker_contract_for_analysis',
    description: 'Same as get_ticker_contract but strips _meta for analyze_ticker.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        mode: { type: 'string' },
        include_portfolio: { type: 'boolean' },
        ohlcv_days: { type: 'number' },
      },
      required: ['ticker'],
    },
  },
  { name: 'get_ohlcv', description: 'Daily OHLCV bars from database.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_fundamentals', description: 'Latest fundamentals snapshot.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_shareholding', description: 'Monthly shareholding pattern.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_macro', description: 'Latest Bangladesh macro snapshot.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_news', description: 'Recent news items.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_data_status', description: 'Data freshness per entity.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'list_tickers', description: 'List tickers in database.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_portfolio', description: 'Your portfolio holdings and account settings.', inputSchema: { type: 'object', properties: {} } },
  { name: 'upsert_position', description: 'Add or update a portfolio position (manual).', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'remove_position', description: 'Remove a portfolio position.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'set_account', description: 'Update capital and risk settings.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'trigger_ingest', description: 'Admin: refresh data for a ticker.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'register_ticker', description: 'Admin: add ticker to watchlist.', inputSchema: { type: 'object', additionalProperties: true } },
  {
    name: 'upsert_research_sources',
    description:
      'Save web/agent research citations (URLs, titles, extracted facts) for audit lineage. Dedupes by url+ticker. Optionally promote verified shareholding via promote_shareholding.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'DSE symbol, e.g. WALTONHIL (optional for macro-only research)' },
        session_id: { type: 'string', description: 'Chat or research session id for grouping' },
        client_id: { type: 'string', description: 'Client name, e.g. cursor' },
        query_context: { type: 'string', description: 'Search query or research topic' },
        memo_id: { type: 'number', description: 'Attach citations to an existing research memo' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              title: { type: 'string' },
              headline: { type: 'string' },
              publisher: { type: 'string' },
              source: { type: 'string' },
              published_date: { type: 'string' },
              date: { type: 'string' },
              category: {
                type: 'string',
                enum: ['shareholding', 'macro', 'news', 'fundamentals', 'corporate', 'other'],
              },
              extracted_facts: { type: 'object', additionalProperties: true },
              notes: { type: 'string' },
            },
          },
        },
        promote_shareholding: {
          type: 'object',
          description: 'Optional: write verified shareholding % into shareholding_monthly',
          properties: {
            month: { type: 'string', description: 'YYYY-MM' },
            sponsor: { type: 'number' },
            govt: { type: 'number' },
            institution: { type: 'number' },
            foreign: { type: 'number' },
            public: { type: 'number' },
            source: { type: 'string' },
          },
        },
      },
      required: ['sources'],
    },
  },
  {
    name: 'get_research_sources',
    description: 'List saved research citations by ticker, session, or category.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        session_id: { type: 'string' },
        category: { type: 'string' },
        memo_id: { type: 'number' },
        days: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'upsert_research_memo',
    description:
      'Save a full markdown research memo (body_md) with optional summary_json. Links session citations automatically. Use link_all_ticker_sources to attach all unlinked citations for the ticker.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        title: { type: 'string' },
        body_md: { type: 'string', description: 'Full markdown report' },
        summary_json: { type: 'object', additionalProperties: true },
        as_of: { type: 'string', description: 'YYYY-MM-DD price/data as-of date' },
        session_id: { type: 'string' },
        client_id: { type: 'string' },
        memo_id: { type: 'number', description: 'Update existing memo by id' },
        parent_memo_id: { type: 'number' },
        link_session_sources: { type: 'boolean', default: true },
        link_all_ticker_sources: { type: 'boolean', description: 'Link all unlinked citations for ticker' },
        link_source_ids: { type: 'array', items: { type: 'number' } },
      },
      required: ['title', 'body_md'],
    },
  },
  {
    name: 'get_research_memo',
    description: 'Fetch a research memo by id, ticker, or session_id. Set include_body=false for metadata only.',
    inputSchema: {
      type: 'object',
      properties: {
        memo_id: { type: 'number' },
        ticker: { type: 'string' },
        session_id: { type: 'string' },
        include_body: { type: 'boolean', default: true },
        include_sources: { type: 'boolean', description: 'Include linked research_sources' },
      },
    },
  },
  {
    name: 'list_research_memos',
    description: 'List research memo history for a ticker (metadata only unless include_body=true).',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        limit: { type: 'number' },
        include_body: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'list_skills',
    description: 'List Agent Skills from disk plus any DB overrides (dashboard/MCP skill editor).',
    inputSchema: {
      type: 'object',
      properties: {
        include_skill_md: { type: 'boolean', description: 'Include full SKILL.md in each row (large)' },
      },
    },
  },
  {
    name: 'get_skill',
    description: 'Fetch one skill by slug (merged DB override + disk). Returns full skill_md.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Skill folder name, e.g. technical-analysis' },
        skill: { type: 'string', description: 'Alias for slug' },
        include_disk_copy: { type: 'boolean', description: 'Include original on-disk SKILL.md when overridden' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'upsert_skill',
    description: 'Admin: save a SKILL.md override to PostgreSQL. Optional sync_to_disk writes skills/{slug}/SKILL.md.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        skill_md: { type: 'string', description: 'Full SKILL.md content including YAML frontmatter' },
        sync_to_disk: { type: 'boolean', description: 'Also write to skills/ folder (requires STOCK_BUDDY_SKILLS_WRITE_DISK=1)' },
        is_active: { type: 'boolean', default: true },
        client_id: { type: 'string' },
        tool_name: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        metadata_json: { type: 'object', additionalProperties: true },
      },
      required: ['slug', 'skill_md'],
    },
  },
  {
    name: 'reset_skill',
    description: 'Admin: delete DB override for a skill and revert to on-disk SKILL.md.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
  {
    name: 'sync_skill_to_disk',
    description: 'Admin: write the effective skill (DB override if present, else disk) back to skills/{slug}/SKILL.md.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
] as const;
