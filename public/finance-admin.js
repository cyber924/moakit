import {mountKitOrders} from './kit-orders.js';
import {mountSalesDashboard} from './finance-sales-dashboard.mjs';
import {mountSettlementDashboard} from './finance-settlement-dashboard.mjs';

// Sales and settlement are independent Firebase-only operational dashboards.
// No retired legacy back-end endpoints or migration requests are issued here.
export function mountFinanceAdmin(target,section='sales',options={}){
 if(options.orders){
  target.innerHTML='<div class="admin-heading"><span>SALES / KIT ORDERS</span><h1>KIT 주문·배송</h1>'+
   '<p>Firebase에 기록된 KIT 주문과 배송 상태를 관리합니다.</p></div>'+
   '<p><a class="admin-button" href="#admin/sales">판매 현황으로 돌아가기</a></p>'+
   '<div data-kit-orders-admin></div>';
  mountKitOrders(target.querySelector('[data-kit-orders-admin]'),{admin:true});
  return;
 }
 if(section==='settlements')return mountSettlementDashboard(target);
 return mountSalesDashboard(target);
}
