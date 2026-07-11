"use client";

import { CrmModal } from "../../_components/crm-modal";
import { ProductForm, ProductInitial } from "./product-form";

interface Props {
  product: ProductInitial | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductEditModal({ product, onClose, onSaved }: Props) {
  if (!product) return null;
  return (
    <CrmModal open onClose={onClose} title={`상품 수정: ${product.name}`} size="lg">
      <ProductForm mode="edit" initial={product} onSaved={onSaved} onCancel={onClose} />
    </CrmModal>
  );
}
