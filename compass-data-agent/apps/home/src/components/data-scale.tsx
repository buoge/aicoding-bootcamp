import { Disclosure } from "@/components/ui/disclosure";
import s from "./engineering-story.module.css";

// Canonical delivery: Feature 998 IMPLEMENTATION.md, 2026-10-23 diagnostic release.
// Verified counts from diagnostic-v3-20261019; capacity still needs load testing.
const deliveries = [["诊断版 · 已交付", "111,055", "156,180", "805,572"]];
const sources = [
  ["商品系统", "品牌、品类、SPU、SKU、价格 / 成本历史、平台商品映射"],
  ["订单与门店 POS", "订单头、订单行、支付、取消、优惠分摊"],
  ["仓储与履约", "发货、收货、调拨、库存流水、日库存快照"],
  ["售后系统", "退货申请、验收、退款、售后原因"],
  ["会员系统", "会员、等级、加入时间与跨渠道身份关联"],
  ["营销与渠道报表", "活动、日花费、曝光、点击、渠道费用"],
  ["自有渠道埋点", "会话、访问、浏览、搜索、加购、下单事件"],
  ["经营计划", "月度销售目标、预算、活动计划"],
];

export function DataScaleDetails() {
  return (
    <Disclosure className={s.details} title="查看已交付数据规模、来源与关键表对象">
      <div className={s.scaleTableWrap}>
        <table className={s.scaleTable}>
          <caption>2026-10-23 正式交付 · 合成业务数据实际数量</caption>
          <thead>
            <tr>
              <th scope="col">版本</th>
              <th scope="col">订单 / 笔</th>
              <th scope="col">订单行 / 条</th>
              <th scope="col">行为事件 / 条</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map(([delivery, ...values]) => (
              <tr key={delivery}>
                <th scope="row">{delivery}</th>
                {values.map((value) => (
                  <td key={value}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.inventoryScale}>
        <strong>491,400 条库存日快照</strong>
        <p>
          另有 491,400 条库存估值快照，覆盖 2025-10-01 至 2026-03-31。
          <br />
          按实际经营的地点与 SKU 生成，保留缺货零记录；更早日期可通过库存流水重放。
        </p>
      </div>
      <h3 className={s.sourceTitle}>8 类来源，哪些数据要关联？</h3>
      <div className={s.sourceRows}>
        {sources.map(([name, objects]) => (
          <div key={name}>
            <strong>{name}</strong>
            <span>{objects}</span>
          </div>
        ))}
      </div>
      <p className={s.footnote}>
        表数量口径：71 张关系表、748 个字段、247 个外键；订单按订单头计数，包含支付失败和取消。
        学员单文件 SQL 另含 1 张公开资料表，内嵌 27 份材料。
      </p>
    </Disclosure>
  );
}
