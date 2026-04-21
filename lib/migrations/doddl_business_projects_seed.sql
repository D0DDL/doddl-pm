-- ================================================================
-- doddl Business Projects — Meeting Actions Seed
-- ================================================================
-- Version:     1.0
-- Date:        April 2026
-- Source:      Management meeting 16 April 2026
-- Prepared by: Alex (PM) via Claude Project
-- ----------------------------------------------------------------
-- RUN AFTER: doddl_ai_os_seed.sql
-- UUID ranges continue from that file — no conflicts.
-- RUN IN:  Supabase Staging SQL Editor ONLY
--          Project: doddl-pm-staging (iknwprxycshrickpswjz)
-- ----------------------------------------------------------------
-- STRUCTURAL DECISIONS APPLIED
-- · Action 9 removed — bundle box PM tool walkthrough is
--   redundant now that Bundle Box is its own project
-- · Action 29 (Zoho CRM) is its own standalone project
-- · Pete and Petra tasks assigned to Laura
-- · Jon assigned where owner was listed as Jon + Laura (tech lead)
-- · Laura assigned where owner was listed as Laura + Catherine
-- ----------------------------------------------------------------
-- VERIFICATION AFTER RUN
--   SELECT COUNT(*) FROM projects;     -- expect 11
--   SELECT COUNT(*) FROM task_groups;  -- expect 32
--   SELECT COUNT(*) FROM tasks;        -- expect 112
-- ================================================================

BEGIN;

-- ================================================================
-- PROJECTS (IDs 7–11, continuing from AI OS seed)
-- ================================================================

INSERT INTO projects (id, name, description, status, priority, owner, start_date, due_date) VALUES

('10000000-0000-0000-0000-000000000007',
 'Bundle Box Launch',
 'Launch the doddl bundle box across UK and international markets. Covers launch date decision, pricing confirmation, and QR code destination page. Project plan walkthrough is superseded — this project IS the plan.',
 'active', 'critical', 'Jon',
 '2026-04-16', '2026-05-31'),

('10000000-0000-0000-0000-000000000008',
 'Subscription & Dinner Club',
 'Develop the doddl subscription offering and Doddl Dinner Club model. Covers product-to-stage mapping, commercial modelling, and full review of all previous Dinner Club work including the BVI model.',
 'active', 'high', 'Jon',
 '2026-04-16', '2026-05-30'),

('10000000-0000-0000-0000-000000000009',
 'Website & Content',
 'Developmental content positioning for the website. Storyboards, expert mapping, product and discount structure review, customer touchpoint audit, and Meta ads strategy aligned to bundle box launch.',
 'active', 'high', 'Laura',
 '2026-04-16', '2026-05-30'),

('10000000-0000-0000-0000-000000000010',
 'Zoho CRM Review',
 'Audit the existing Zoho CRM build with Chris. Decide whether to continue investing or accept the sunk cost (~£40K) and move on. Binary decision — no further Zoho spend until this project is closed.',
 'active', 'high', 'Jon',
 '2026-04-16', '2026-05-15'),

('10000000-0000-0000-0000-000000000011',
 'Business Operations — Q2 2026',
 'Operational actions from the 16 April management meeting that do not belong to a dedicated project. Covers product development, affiliates and influencers, geographic expansion, Japan, finance and investment, and Amazon operational tasks.',
 'active', 'medium', 'Jon',
 '2026-04-16', '2026-06-30');


-- ================================================================
-- TASK GROUPS (IDs 23–32, continuing from AI OS seed)
-- ================================================================

INSERT INTO task_groups (id, project_id, name, position) VALUES

-- Bundle Box Launch
('20000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000007', 'Launch Planning', 1),

-- Subscription & Dinner Club
('20000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000008', 'Subscription & Dinner Club', 1),

-- Website & Content
('20000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000009', 'Website & Content', 1),

-- Zoho CRM Review
('20000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000010', 'Zoho CRM Review', 1),

-- Business Operations — 6 task groups
('20000000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000011', 'Product Development', 1),
('20000000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000011', 'Affiliates & Influencers', 2),
('20000000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000011', 'Geographic Expansion', 3),
('20000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000011', 'Japan', 4),
('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000011', 'Finance & Investment', 5),
('20000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000011', 'Amazon Operational', 6);


-- ================================================================
-- TASKS (IDs 83–112, continuing from AI OS seed)
-- ================================================================

-- ----------------------------------------------------------------
-- BUNDLE BOX LAUNCH — 3 tasks
-- Actions: 10, 11, 12 (action 9 removed — redundant)
-- ----------------------------------------------------------------

INSERT INTO tasks (id, title, description, status, priority, project_id, group_id, assigned_to, due_date, depends_on, notes, position) VALUES

('30000000-0000-0000-0000-000000000083',
 'Set firm launch date and soft-sell plan',
 'Set a firm go-live date. Define when soft-sell begins (can start before full launch). Confirm Amazon UK/US carries dusky rose and fresh green only. Confirm all distribution partners are included. Define success benchmarks: poor <100 units/month, good ~500/month, very strong = sold out within 3 months.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000023',
 'Jon', '2026-04-30', NULL,
 'Source: April meeting transcript. Decision gate — QR code page and Meta ads work cannot be scoped until launch date is confirmed.',
 1),

('30000000-0000-0000-0000-000000000084',
 'Confirm bundle box pricing — introductory vs full price',
 'Confirm introductory price (~£65 agreed) and the timeline and conditions for moving to full £80. Agree on whether the baby-to-toddler feeding set stays discounted or is removed/repriced to avoid undermining the bundle proposition.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000023',
 'Jon', '2026-04-30', NULL,
 'Source: April meeting transcript.',
 2),

('30000000-0000-0000-0000-000000000085',
 'Build QR code destination page',
 'Build the page customers reach when scanning the QR code inside the bundle box. Must be live on or before launch day. Consider linking to a developmental milestones guide rather than a generic landing page.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000023',
 'Jon', '2026-05-15', '30000000-0000-0000-0000-000000000083',
 'Source: April meeting transcript. Was unassigned in meeting — assigned to Jon. Depends on launch date being confirmed first.',
 3),


-- ----------------------------------------------------------------
-- SUBSCRIPTION & DINNER CLUB — 3 tasks
-- Actions: 1, 2, 3
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000086',
 'Subscription model — product mapping',
 'Model the current product range. Identify when each product is relevant to a child at each developmental stage. Highlight any gaps. Propose additional products to fill gaps — specify whether innovation-led or white label.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000024',
 'Laura', '2026-05-15', NULL,
 'Source: April meeting (original notes). Listed as Laura + Catherine — assigned to Laura.',
 1),

('30000000-0000-0000-0000-000000000087',
 'Subscription model — commercial analysis',
 'Develop a commercial model for the subscription offering. Include pricing and cost analysis to ensure financial viability if customers drop out early. Front-load value so the business is not exposed if customers cancel before completing the full term.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000024',
 'Jon', '2026-05-15', '30000000-0000-0000-0000-000000000086',
 'Source: April meeting (original notes). Depends on product mapping being complete first.',
 2),

('30000000-0000-0000-0000-000000000088',
 'Doddl Dinner Club — locate and review all previous work',
 'Locate and review all previous Dinner Club work. Prepare findings to present at the next meeting for further scoping. Include the model discussed in the BVI, community structure, and ambassador/partner percentages.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000024',
 'Laura', '2026-05-08', NULL,
 'Source: April meeting (original notes). Listed as Laura + Catherine — assigned to Laura.',
 3),


-- ----------------------------------------------------------------
-- WEBSITE & CONTENT — 5 tasks
-- Actions: 4, 5, 6, 7, 8
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000089',
 'Developmental content storyboard and wireframe',
 'Storyboard and wireframe the developmental content for the website: stage 1/2/3 milestones, transition guides, expert quotes. Identify content gaps. Coordinate input from experts and nursery research team prior to bundle box launch.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000025',
 'Laura', '2026-05-15', NULL,
 'Source: April meeting (original notes).',
 1),

('30000000-0000-0000-0000-000000000090',
 'Expert support mapping',
 'Map the required expert support: what is needed, why, who should be involved (Tanya, Stacey, Claire, nursery research team), and how each maps to audience messaging. Integrate findings from ongoing nursery research.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000025',
 'Laura', '2026-05-15', NULL,
 'Source: April meeting (original notes). Listed as Laura + Catherine — assigned to Laura.',
 2),

('30000000-0000-0000-0000-000000000091',
 'Website product and discount structure review',
 'Reassess which products and bundles remain on site ahead of bundle box launch. Remove confusing overlaps. Reduce discount levels (baby-to-toddler set from 20%). Switch display from % to £ savings. Move upsell logic to product pages only — not category pages.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000025',
 'Jon', '2026-04-30', NULL,
 'Source: April meeting (transcript only). Listed as Laura + Jon — assigned to Jon. Must be complete before bundle box launch.',
 3),

('30000000-0000-0000-0000-000000000092',
 'Customer touchpoint audit — developmental alignment',
 'Review all customer touchpoints: postcard/thank-you insert, email sign-offs, pack inserts, QR destination. Update language and design to align with developmental positioning once website content is locked. Consider QR code linking to a developmental milestones guide.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000025',
 'Laura', '2026-05-30', '30000000-0000-0000-0000-000000000089',
 'Source: April meeting (transcript only). Depends on website content storyboard being locked first.',
 4),

('30000000-0000-0000-0000-000000000093',
 'Meta ads strategy for bundle box launch',
 'Define number of ads required, target audiences, messaging pillars, and asset specs (format, film length, dimensions). Align with developmental positioning. Agree on creative briefing process — who decides the message, who produces the assets.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000025',
 'Laura', '2026-05-08', NULL,
 'Source: April meeting (transcript only).',
 5),


-- ----------------------------------------------------------------
-- ZOHO CRM REVIEW — 1 task
-- Action: 29
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000094',
 'Zoho CRM audit — continue or cut?',
 'Review with Chris what the Zoho build was meant to achieve, what it currently does, and whether it is the right tool. Decide whether to keep investing or accept the sunk cost (~£40K) and move on. Do not pursue further just because money was spent.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000026',
 'Jon', '2026-05-15', NULL,
 'Source: April meeting (transcript only). Involves Chris (finance). Binary outcome required — no further Zoho spend until decision is made and this project closed.',
 1),


-- ----------------------------------------------------------------
-- BUSINESS OPS — Product Development — 2 tasks
-- Actions: 13, 14
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000095',
 'Bib and chopsticks — complete all launch steps',
 'Confirm updated bib pricing post-Trump tariff impact. Get printed bib sample approved before mass production (colours were an issue on the previous design). Confirm tooling and IP/material choices for chopsticks. Target: both products ready by mid-October.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000027',
 'Jon', '2026-10-15', NULL,
 'Source: April meeting (original notes + transcript). Mid-October target stated in meeting.',
 1),

('30000000-0000-0000-0000-000000000096',
 'Product pipeline planning — chase Charlotte',
 'Chase Charlotte to initiate discussions on the next product set. Aim to agree priorities for the six-month period following the current one (approx. October–February). Align to subscription model gaps identified by Laura and Catherine.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000027',
 'Jon', '2026-05-08', NULL,
 'Source: April meeting (original notes).',
 2),


-- ----------------------------------------------------------------
-- BUSINESS OPS — Affiliates & Influencers — 4 tasks
-- Actions: 15, 16, 17, 18
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000097',
 'Set up Amazon attribution links for influencers',
 'Create Amazon attribution and campaign links via Campaign Manager — one per product for UK, US, and Canada influencers. Share with current affiliates: Verity, Miku, and Canadian accounts.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000028',
 'Jon', '2026-04-30', NULL,
 'Source: April meeting (transcript only).',
 1),

('30000000-0000-0000-0000-000000000098',
 'Set up TikTok Shop affiliate links — UK only',
 'Ensure relevant products are listed on TikTok Shop. Generate affiliate links for UK-based influencers. Confirm eligible products. Note: not applicable for US at this stage.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000028',
 'Jon', '2026-04-30', NULL,
 'Source: April meeting (transcript only).',
 2),

('30000000-0000-0000-0000-000000000099',
 'Goodwill gestures for top influencers — Verity and Miku',
 'For influencers driving traffic but earning minimal commission, send a non-cash thank-you (flowers, development toy, etc.) to maintain goodwill. Agree a small per-person budget with Katie before actioning.',
 'not_started', 'low',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000028',
 'Laura', '2026-05-08', NULL,
 'Source: April meeting (transcript only). Listed as Laura/Katie — assigned to Laura.',
 3),

('30000000-0000-0000-0000-000000000100',
 'Keep TikTok and Pinterest on minimal life support',
 'Post occasionally (a pin, a repurposed clip) to prevent accounts looking dead. Piggyback on Izzy and Sarah content where possible. No active pursuit and no budget required.',
 'not_started', 'low',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000028',
 'Laura', NULL, NULL,
 'Source: April meeting (transcript only). Ongoing — no hard deadline.',
 4),


-- ----------------------------------------------------------------
-- BUSINESS OPS — Geographic Expansion — 5 tasks
-- Actions: 19, 20, 21, 22, 23
-- Pete and Petra tasks assigned to Laura
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000101',
 'Activate Germany B2B outreach — Petra brief',
 'Send Petra a project proposal outline so she can allocate time against a fixed ~€500 budget. Provide translated versions of relevant decks and materials. Agree what success looks like upfront before any work begins.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000029',
 'Laura', '2026-05-08', NULL,
 'Source: April meeting (original notes + transcript). Originally assigned to Petra — Laura owns the brief and relationship management.',
 1),

('30000000-0000-0000-0000-000000000102',
 'UK premium retail for bundle boxes — Pete follow-up',
 'Follow up with Pete to explore placing bundle boxes in premium independent UK retail (Selfridges-tier). Use as proof of concept before any US retail push.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000029',
 'Laura', '2026-05-15', NULL,
 'Source: April meeting (original notes + transcript). Originally assigned to Pete — Laura owns the follow-up.',
 2),

('30000000-0000-0000-0000-000000000103',
 'Nursery wholesale channel research',
 'Research the 8-9 nursery wholesalers identified (YPO and similar) who supply direct to nurseries across the UK. Produce a shortlist with supplier agreement routes. Follow up on previous near-miss conversations. Post nursery research progress to LinkedIn.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000029',
 'Jon', '2026-05-30', NULL,
 'Source: April meeting (transcript only).',
 3),

('30000000-0000-0000-0000-000000000104',
 'Malaysia distributor outreach — 2 to 3 targets',
 'From the previously compiled list, select 2-3 distributors and send LinkedIn and email outreach. Time this when chopsticks are ready to provide a new product hook for the outreach message.',
 'not_started', 'low',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000029',
 'Jon', '2026-06-30', '30000000-0000-0000-0000-000000000095',
 'Source: April meeting (transcript only). Timing depends on chopsticks being ready — blocked behind bib and chopsticks task.',
 4),

('30000000-0000-0000-0000-000000000105',
 'Walmart and Bol listing setup',
 'Progress Walmart US (FBA-equivalent model) and Bol listings. Listing content already exists for the US market. Requires account setup, bank validation, and inbound stock decisions. Test the ad platform — has changed significantly since the last attempt 3+ years ago.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000029',
 'Jon', '2026-05-30', NULL,
 'Source: April meeting (original notes + transcript).',
 5),


-- ----------------------------------------------------------------
-- BUSINESS OPS — Japan — 2 tasks
-- Actions: 24, 25
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000106',
 'Lock and send Japan pricing strategy to Akiyo',
 'Finalise the correct in-market price across all products (benchmarked against USD pricing, with Asia uplift). Simplify and clean up existing marketplace listings. Send Akiyo a clear pricing brief as the first step before any further Amazon Japan work.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000030',
 'Jon', '2026-05-08', NULL,
 'Source: April meeting (original notes + transcript). Do this before the strategic call — Akiyo needs the pricing context first.',
 1),

('30000000-0000-0000-0000-000000000107',
 'Strategic call with Akiyo — long-term intentions',
 'Have a frank conversation: once current stock sells through, does she intend to reorder? What would she do differently? Would she invest in an e-commerce or Amazon specialist? Her answer determines whether to continue, restructure, or plan an exit from the relationship.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000030',
 'Jon', '2026-05-15', '30000000-0000-0000-0000-000000000106',
 'Source: April meeting (original notes + transcript). Do not have this call until the pricing brief has been sent and received.',
 2),


-- ----------------------------------------------------------------
-- BUSINESS OPS — Finance & Investment — 3 tasks
-- Actions: 26, 27, 28
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000108',
 'Revenue gap analysis and 2026 forecast review — URGENT',
 'Pull the 2026 forecast. Show where the additional ~£50K/month (from ~£110K to £150-165K target) should come from, broken down by channel and market. Cover the last two weeks of missed status updates. Have ready for Tuesday weekly catch-up.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000031',
 'Jon', '2026-04-22', NULL,
 'Source: April meeting (original notes + transcript). URGENT — needed for Tuesday catch-up. Earliest due date in this file.',
 1),

('30000000-0000-0000-0000-000000000109',
 'Explore small bridging loan — ~£60K',
 'Model whether a short-term loan of ~£60K would materially accelerate key priorities (chopsticks tooling, product pipeline, Daisy, etc.) without over-pressuring the P&L. Funding Circle named as a candidate lender.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000031',
 'Jon', '2026-05-08', '30000000-0000-0000-0000-000000000108',
 'Source: April meeting (transcript only). Complete revenue gap analysis first — that analysis informs whether the loan is needed.',
 2),

('30000000-0000-0000-0000-000000000110',
 'Cost modelling — stripped-back vs full investment scenarios',
 'Model various spending scenarios to determine the minimum viable spend required to hit growth targets and fund new product launches. Includes Daisy, Sarah, Izzy, photography, and Amazon ad spend.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000031',
 'Jon', '2026-05-08', '30000000-0000-0000-0000-000000000108',
 'Source: April meeting (original notes). Complete revenue gap analysis first.',
 3),


-- ----------------------------------------------------------------
-- BUSINESS OPS — Amazon Operational — 2 tasks
-- Actions: 30, 31
-- (Action 29 Zoho moved to its own standalone project)
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000111',
 'Amazon Japan infringement report — resolve submission issue',
 'The baby-goo competitor ASIN from Amazon Japan is not being recognised in the Report a Violation tool. Work through the correct submission route — likely need to go via Seller Support with the full PDF report as an attachment rather than the standard violation flow.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000032',
 'Jon', '2026-04-30', NULL,
 'Source: April meeting (transcript only).',
 1),

('30000000-0000-0000-0000-000000000112',
 'Amazon review reinstatement — assess and formally close',
 'Current review count is ~1,733-1,740. Community outreach got no response. Assess whether further escalation is realistic or whether the reviews are permanently lost. Formally close out the action if further escalation is not viable.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000032',
 'Jon', '2026-04-30', NULL,
 'Source: April meeting (transcript only).',
 2);

COMMIT;

-- ================================================================
-- VERIFICATION QUERIES — run after COMMIT
-- ================================================================
-- Full counts (both seed files applied):
-- SELECT COUNT(*) FROM projects;     -- expect 11
-- SELECT COUNT(*) FROM task_groups;  -- expect 32
-- SELECT COUNT(*) FROM tasks;        -- expect 112
--
-- Business projects breakdown:
-- SELECT p.name, COUNT(t.id) AS task_count
-- FROM projects p
-- JOIN tasks t ON t.project_id = p.id
-- WHERE p.id >= '10000000-0000-0000-0000-000000000007'
-- GROUP BY p.name
-- ORDER BY p.name;
--
-- Expected results:
--   Amazon Operational (within Business Ops)  2
--   Bundle Box Launch                         3
--   Business Operations — Q2 2026            18
--   Subscription & Dinner Club                3
--   Website & Content                         5
--   Zoho CRM Review                           1
--   Total business tasks:                    30
-- ================================================================
