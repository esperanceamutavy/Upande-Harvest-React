export interface PickListItem {
  item_code: string;
  item_name?: string | null;
  qty: number;
  uom: string;
  custom_stem_length: string;
  custom_box_id: number;
  warehouse?: string | null;
}

export interface OrderPickList {
  name: string;
  docstatus: number;
  sales_order: string;
  customer: string;
  locations: PickListItem[];
}

export interface FarmPackListItemRow {
  item_code: string;
  bunch_uom: string;
  stem_length: string;
  bunch_qty?: number;
  bunch_id?: string;
  box_id?: string;
}

export interface FarmPackList {
  custom_sales_order: string;
  custom_farm: string;
  pack_list_item: FarmPackListItemRow[];
}

export interface PickListWithFarmPackListResponse {
  order_pick_list: OrderPickList;
  farm_pack_lists: FarmPackList[];
}

export interface PackListItemPayload {
  item_code: string;
  bunch_uom: string;
  bunch_qty: number;
  source_warehouse: string;
  sales_order_id: string;
  customer_id: string;
  custom_number_of_stems: number;
  stem_length: string;
  box_id: string;
  bunch_id: string;
}

export interface CreateOrUpdateFarmPackListPayload {
  custom_sales_order: string;
  custom_customer: string;
  custom_farm: string;
  custom_order_pick_list: string;
  items: PackListItemPayload[];
}

export interface CreateOrUpdateFarmPackListResponse {
  status: 'created' | 'updated';
  message: string;
  docname: string;
}

// Local screen state for a bunch ready to pack
export interface ReadyToPackItem {
  bunch_id: string;
  variety: string;
  bunch_size: string;  // bunch_uom
  stem_length: string;
  box_id: string;
  customer_id: string;
  sales_order_id: string;
}
