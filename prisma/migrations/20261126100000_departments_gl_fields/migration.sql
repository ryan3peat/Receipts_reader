-- Departments, department GL codes (EFI), and GL fields shown to cardholders. Additive only.

ALTER TABLE "transactions" ADD COLUMN "gl_field_key" TEXT;
ALTER TABLE "transactions" ADD COLUMN "department_splits" JSONB;

CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_user_id_code_key" ON "departments"("user_id", "code");

CREATE TABLE "user_departments" (
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_departments_pkey" PRIMARY KEY ("user_id", "department_id")
);

CREATE TABLE "efi_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "nr_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "efi_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "efi_codes_user_id_code_key" ON "efi_codes"("user_id", "code");
CREATE UNIQUE INDEX "efi_codes_user_id_nr_code_department_id_key" ON "efi_codes"("user_id", "nr_code", "department_id");

CREATE TABLE "gl_fields" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "combined" BOOLEAN NOT NULL DEFAULT false,
    "post_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gl_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gl_fields_user_id_key_key" ON "gl_fields"("user_id", "key");

CREATE TABLE "gl_field_members" (
    "field_id" UUID NOT NULL,
    "nr_code" TEXT NOT NULL,

    CONSTRAINT "gl_field_members_pkey" PRIMARY KEY ("field_id", "nr_code")
);

CREATE TABLE "gl_field_departments" (
    "field_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,

    CONSTRAINT "gl_field_departments_pkey" PRIMARY KEY ("field_id", "department_id")
);

ALTER TABLE "departments" ADD CONSTRAINT "departments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "efi_codes" ADD CONSTRAINT "efi_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "efi_codes" ADD CONSTRAINT "efi_codes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gl_fields" ADD CONSTRAINT "gl_fields_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gl_field_members" ADD CONSTRAINT "gl_field_members_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "gl_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gl_field_departments" ADD CONSTRAINT "gl_field_departments_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "gl_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gl_field_departments" ADD CONSTRAINT "gl_field_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
