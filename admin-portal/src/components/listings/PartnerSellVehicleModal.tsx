'use client';

export type EditableListing = {
  id: string;
  title: string;
  price: string | number;
  [key: string]: unknown;
};

export default function PartnerSellVehicleModal({
  isOpen: _isOpen,
  onClose: _onClose,
  listingToEdit: _listingToEdit,
  onSaved: _onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  listingToEdit?: EditableListing | null;
  onSaved?: () => void | Promise<void>;
}) {
  return null;
}
