"use client";

import React, {useEffect, useState} from "react";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";

export type CategoryFormValues = {
  description: string;
  is_visible: boolean;
  name: string;
};

export function CategoryForm({
  busy = false,
  initialValues,
  onCancel,
  onSubmit,
  submitLabel,
  title,
}: {
  busy?: boolean;
  initialValues?: Partial<CategoryFormValues>;
  onCancel?: () => void;
  onSubmit: (values: CategoryFormValues) => Promise<void> | void;
  submitLabel: string;
  title: string;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [isVisible, setIsVisible] = useState(initialValues?.is_visible ?? true);

  useEffect(() => {
    setName(initialValues?.name ?? "");
    setDescription(initialValues?.description ?? "");
    setIsVisible(initialValues?.is_visible ?? true);
  }, [initialValues]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      description,
      is_visible: isVisible,
      name,
    });
  }

  return (
    <form className="panel-stack" onSubmit={(event) => void handleSubmit(event)}>
      <h3>{title}</h3>
      <Input
        autoComplete="off"
        disabled={busy}
        label="Nombre *"
        onChange={(event) => setName(event.target.value)}
        required
        value={name}
      />
      <label className="field">
        <span className="field__label">Descripción</span>
        <textarea
          className="ui-input ui-textarea"
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          value={description}
        />
      </label>
      <label className="login-legal__checkbox">
        <input
          checked={isVisible}
          disabled={busy}
          onChange={(event) => setIsVisible(event.target.checked)}
          type="checkbox"
        />
        <span>Visible</span>
      </label>
      <div className="actions">
        <Button disabled={busy || !name.trim()} type="submit">
          {busy ? "Guardando..." : submitLabel}
        </Button>
        {onCancel ? (
          <Button disabled={busy} onClick={onCancel} type="button" variant="secondary">
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
