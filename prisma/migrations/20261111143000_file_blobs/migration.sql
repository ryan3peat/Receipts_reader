CREATE TABLE "file_blobs" (
    "file_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "file_blobs_pkey" PRIMARY KEY ("file_id")
);

ALTER TABLE "file_blobs" ADD CONSTRAINT "file_blobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
