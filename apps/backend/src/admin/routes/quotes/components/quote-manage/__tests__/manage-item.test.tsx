import { AdminOrder, AdminOrderPreview } from "@medusajs/framework/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import {
  Controller,
  ControllerProps,
  FormProvider,
  useForm,
} from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAddItemsToQuote,
  useRemoveQuoteItem,
  useUpdateAddedQuoteItem,
  useUpdateQuoteItem,
} from "../../../../../hooks/api";
import { ManageItem } from "../manage-item";

vi.mock("../../../../../hooks/api", () => ({
  useAddItemsToQuote: vi.fn(),
  useRemoveQuoteItem: vi.fn(),
  useUpdateAddedQuoteItem: vi.fn(),
  useUpdateQuoteItem: vi.fn(),
}));

// The dashboard form wraps these react-hook-form primitives. Loading the full
// dashboard bundle needs its Admin build-time globals.
vi.mock("@medusajs/dashboard/components", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  );
  const Form = Object.assign(
    (props: Parameters<typeof FormProvider>[0]) => <FormProvider {...props} />,
    {
      Field: (props: ControllerProps) => <Controller {...props} />,
      Item: Passthrough,
      Control: Passthrough,
      Label: Passthrough,
      Hint: Passthrough,
      ErrorMessage: () => null,
    }
  );

  return { Form };
});

// Render menu actions as plain buttons; the dropdown itself is not under test.
vi.mock("../../../../../components/common", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ActionMenu: ({
    groups,
  }: {
    groups: { actions: { label: string; onClick: () => void }[] }[];
  }) => (
    <>
      {groups.flatMap((group) =>
        group.actions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))
      )}
    </>
  ),
}));

const item = {
  id: "ordli_1",
  title: "Webcam",
  product_title: "Webcam",
  variant_id: "variant_1",
  variant_sku: "WEBCAM-BLACK",
  thumbnail: null,
  quantity: 1,
  unit_price: 59,
  total: 59,
  detail: { fulfilled_quantity: 0 },
  actions: [],
} as unknown as AdminOrderPreview["items"][0];

const updateOriginalItem = vi.fn();

const FormWrapper = ({ children }: { children: ReactNode }) => {
  const form = useForm();

  return <FormProvider {...form}>{children}</FormProvider>;
};

const renderPriceInput = async () => {
  const user = userEvent.setup();

  render(
    <FormWrapper>
      <ManageItem
        originalItem={item as unknown as AdminOrder["items"][0]}
        item={item}
        currencyCode="eur"
        orderId="order_1"
      />
    </FormWrapper>
  );

  await user.click(screen.getByRole("button", { name: "Update Price" }));

  return { user, input: screen.getByRole("textbox") as HTMLInputElement };
};

beforeEach(() => {
  updateOriginalItem.mockResolvedValue({});
  vi.mocked(useUpdateQuoteItem).mockReturnValue({
    mutateAsync: updateOriginalItem,
  } as unknown as ReturnType<typeof useUpdateQuoteItem>);

  for (const hook of [
    useAddItemsToQuote,
    useRemoveQuoteItem,
    useUpdateAddedQuoteItem,
  ]) {
    vi.mocked(hook).mockReturnValue({ mutateAsync: vi.fn() } as never);
  }
});

describe("quote item price override", () => {
  it("saves a grouped price and an edit of that grouped price", async () => {
    const { user, input } = await renderPriceInput();

    await user.clear(input);
    await user.type(input, "1500");
    await user.tab();

    expect(input.value).toBe("1,500");
    expect(updateOriginalItem).toHaveBeenLastCalledWith({
      quantity: 1,
      unit_price: 1500,
      itemId: "ordli_1",
    });

    await user.click(input);
    await user.keyboard("{End}{Backspace}");
    await user.tab();

    expect(input.value).toBe("150");
    expect(updateOriginalItem).toHaveBeenLastCalledWith({
      quantity: 1,
      unit_price: 150,
      itemId: "ordli_1",
    });
    expect(updateOriginalItem).toHaveBeenCalledTimes(2);
  });

  it("does not send an update for an unchanged or empty price", async () => {
    const { user, input } = await renderPriceInput();

    await user.click(input);
    await user.tab();

    await user.clear(input);
    await user.tab();

    expect(updateOriginalItem).not.toHaveBeenCalled();
  });
});
