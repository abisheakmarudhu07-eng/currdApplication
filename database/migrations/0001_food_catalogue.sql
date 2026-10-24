-- Food fitness tracker: food catalogue/data-ingestion schema
-- Target: MySQL 8.0.16+ / MySQL 8.4, InnoDB, utf8mb4
-- IMPORTANT: source data starts in food_import_staging. Do not publish it to the live catalogue until reviewed.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS food_sources (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_code VARCHAR(64) NOT NULL,
    source_name VARCHAR(200) NOT NULL,
    source_url VARCHAR(1000) NOT NULL,
    license_name VARCHAR(120) NULL,
    license_review_status ENUM('CONFIRMED','UPSTREAM_DECLARED','PERMISSION_REQUIRED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    attribution_text VARCHAR(1000) NULL,
    notes TEXT NULL,
    last_verified_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_sources_code (source_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS food_categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_code VARCHAR(64) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    parent_category_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_categories_code (category_code),
    CONSTRAINT fk_food_category_parent FOREIGN KEY (parent_category_id) REFERENCES food_categories(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS food_import_batches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id BIGINT UNSIGNED NOT NULL,
    batch_key VARCHAR(120) NOT NULL,
    source_release VARCHAR(120) NULL,
    source_file_sha256 CHAR(64) NULL,
    batch_status ENUM('STAGED','UNDER_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'STAGED',
    source_record_count INT UNSIGNED NOT NULL DEFAULT 0,
    reviewed_record_count INT UNSIGNED NOT NULL DEFAULT 0,
    notes TEXT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_import_batch_key (batch_key),
    KEY idx_food_import_batches_source (source_id, started_at),
    CONSTRAINT fk_food_batch_source FOREIGN KEY (source_id) REFERENCES food_sources(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Raw imported rows remain intact for traceability and repeatable QA.
CREATE TABLE IF NOT EXISTS food_import_staging (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    batch_id BIGINT UNSIGNED NOT NULL,
    source_record_id VARCHAR(100) NOT NULL,
    source_claimed_dataset VARCHAR(100) NULL,
    original_name VARCHAR(255) NOT NULL,
    local_name VARCHAR(255) NULL,
    source_category VARCHAR(120) NULL,
    energy_kcal DECIMAL(12,4) NULL,
    protein_g DECIMAL(12,5) NULL,
    fat_g DECIMAL(12,5) NULL,
    carbs_g DECIMAL(12,5) NULL,
    fiber_g DECIMAL(12,5) NULL,
    calcium_mg DECIMAL(12,5) NULL,
    iron_mg DECIMAL(12,5) NULL,
    vitamin_c_mg DECIMAL(12,5) NULL,
    qa_status ENUM('PASS_PRELIMINARY','REVIEW') NOT NULL DEFAULT 'REVIEW',
    qa_flags_json JSON NOT NULL,
    raw_record_json JSON NOT NULL,
    review_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    reviewed_by_user_id BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_staging_source_record (batch_id, source_record_id),
    KEY idx_food_staging_review (review_status, qa_status),
    KEY idx_food_staging_name (original_name),
    CONSTRAINT fk_food_staging_batch FOREIGN KEY (batch_id) REFERENCES food_import_batches(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS foods (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    canonical_key VARCHAR(191) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    category_id BIGINT UNSIGNED NULL,
    item_type ENUM('INGREDIENT','PREPARED_DISH','BRANDED_PRODUCT','SUPPLEMENT','CUSTOM_FOOD','CUSTOM_RECIPE') NOT NULL DEFAULT 'INGREDIENT',
    preparation_state VARCHAR(40) NOT NULL DEFAULT 'UNSPECIFIED',
    brand_name VARCHAR(160) NULL,
    barcode VARCHAR(64) NULL,
    visibility ENUM('GLOBAL','PRIVATE') NOT NULL DEFAULT 'GLOBAL',
    owner_user_id BIGINT UNSIGNED NULL COMMENT 'Add FK to users.id when the application users schema is finalized',
    record_status ENUM('STAGED','NEEDS_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'STAGED',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_canonical_key (canonical_key),
    KEY idx_food_search_name (display_name),
    KEY idx_food_category_status (category_id, record_status, is_active),
    KEY idx_food_owner_visibility (owner_user_id, visibility),
    KEY idx_food_brand_barcode (brand_name, barcode),
    CONSTRAINT fk_food_category FOREIGN KEY (category_id) REFERENCES food_categories(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_food_owner_visibility CHECK ((visibility = 'GLOBAL' AND owner_user_id IS NULL) OR (visibility = 'PRIVATE' AND owner_user_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS food_aliases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    food_id BIGINT UNSIGNED NOT NULL,
    alias_text VARCHAR(255) NOT NULL,
    normalized_alias VARCHAR(255) NOT NULL,
    language_code VARCHAR(12) NOT NULL DEFAULT 'en',
    alias_type ENUM('COMMON_NAME','TAMIL_NAME','TRANSLITERATION','MISSPELLING','SEARCH_KEYWORD') NOT NULL DEFAULT 'COMMON_NAME',
    source_id BIGINT UNSIGNED NULL,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_alias_per_food_language (food_id, normalized_alias, language_code),
    KEY idx_food_alias_search (normalized_alias, language_code),
    CONSTRAINT fk_food_alias_food FOREIGN KEY (food_id) REFERENCES foods(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_food_alias_source FOREIGN KEY (source_id) REFERENCES food_sources(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS food_source_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id BIGINT UNSIGNED NOT NULL,
    source_record_id VARCHAR(120) NOT NULL,
    food_id BIGINT UNSIGNED NULL,
    batch_id BIGINT UNSIGNED NULL,
    original_name VARCHAR(255) NOT NULL,
    source_claimed_dataset VARCHAR(100) NULL,
    raw_record_json JSON NOT NULL,
    mapping_status ENUM('UNMAPPED','MAPPED','REJECTED') NOT NULL DEFAULT 'UNMAPPED',
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_source_external_record (source_id, source_record_id),
    KEY idx_food_source_record_food (food_id),
    CONSTRAINT fk_food_source_record_source FOREIGN KEY (source_id) REFERENCES food_sources(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_food_source_record_food FOREIGN KEY (food_id) REFERENCES foods(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_food_source_record_batch FOREIGN KEY (batch_id) REFERENCES food_import_batches(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS nutrients (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nutrient_code VARCHAR(64) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    standard_unit VARCHAR(16) NOT NULL,
    display_order SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    is_core_macro TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_nutrient_code (nutrient_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS food_nutrition_profiles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    food_id BIGINT UNSIGNED NOT NULL,
    source_record_id BIGINT UNSIGNED NULL,
    basis_amount DECIMAL(10,4) NOT NULL DEFAULT 100.0000,
    basis_unit ENUM('g','ml') NOT NULL DEFAULT 'g',
    profile_method ENUM('SOURCE_REPORTED','RECIPE_CALCULATED','USER_LABEL','USER_ENTERED') NOT NULL DEFAULT 'SOURCE_REPORTED',
    review_status ENUM('PENDING','NEEDS_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    is_preferred TINYINT(1) NOT NULL DEFAULT 0,
    preferred_food_id BIGINT UNSIGNED GENERATED ALWAYS AS (
        CASE
            WHEN is_preferred = 1 AND review_status = 'APPROVED'
            THEN food_id
            ELSE NULL
        END
    ) STORED,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_one_preferred_profile_per_food (preferred_food_id),
    KEY idx_nutrition_profile_food (food_id, review_status),
    CONSTRAINT chk_nutrition_profiles_basis_positive CHECK (basis_amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add foreign keys after table creation due to MySQL limitation with generated columns
ALTER TABLE food_nutrition_profiles
ADD CONSTRAINT fk_nutrition_profile_food FOREIGN KEY (food_id) REFERENCES foods(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE food_nutrition_profiles
ADD CONSTRAINT fk_nutrition_profile_source_record FOREIGN KEY (source_record_id) REFERENCES food_source_records(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS food_nutrient_values (
    profile_id BIGINT UNSIGNED NOT NULL,
    nutrient_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(14,6) NULL,
    value_status ENUM('QUANTIFIED','TRACE','NOT_AVAILABLE','NOT_MEASURED','UNRELIABLE') NOT NULL DEFAULT 'QUANTIFIED',
    source_raw_value VARCHAR(40) NULL COMMENT 'Preserve values such as NA, Tr, or N as supplied by source',
    PRIMARY KEY (profile_id, nutrient_id),
    KEY idx_food_nutrient_lookup (nutrient_id, amount),
    CONSTRAINT fk_food_nutrient_profile FOREIGN KEY (profile_id) REFERENCES food_nutrition_profiles(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_food_nutrient_definition FOREIGN KEY (nutrient_id) REFERENCES nutrients(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_food_nutrient_value_status CHECK ((value_status = 'QUANTIFIED' AND amount IS NOT NULL) OR (value_status <> 'QUANTIFIED' AND amount IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS food_portions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    food_id BIGINT UNSIGNED NOT NULL,
    portion_name VARCHAR(160) NOT NULL,
    quantity_value DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
    quantity_unit ENUM('g','ml','piece','cup','tbsp','tsp','scoop','slice','serving','custom') NOT NULL DEFAULT 'g',
    equivalent_grams DECIMAL(10,4) NULL,
    reference_source_id BIGINT UNSIGNED NULL,
    review_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    notes TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_food_portion_name (food_id, portion_name),
    KEY idx_food_portion_default (food_id, is_default, review_status),
    CONSTRAINT fk_food_portion_food FOREIGN KEY (food_id) REFERENCES foods(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_food_portion_source FOREIGN KEY (reference_source_id) REFERENCES food_sources(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_food_portion_quantity_positive CHECK (quantity_value > 0),
    CONSTRAINT chk_food_portion_grams_positive CHECK (equivalent_grams IS NULL OR equivalent_grams > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS recipes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    food_id BIGINT UNSIGNED NOT NULL,
    yield_weight_g DECIMAL(12,4) NULL COMMENT 'Final edible cooked batch weight; enables per-100g recipe values',
    recipe_source VARCHAR(255) NULL,
    calculation_method ENUM('INGREDIENT_SUM','SOURCE_PROFILE','USER_LABEL','MANUAL_ENTRY') NOT NULL DEFAULT 'INGREDIENT_SUM',
    instructions TEXT NULL,
    review_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_recipe_food (food_id),
    CONSTRAINT fk_recipe_food FOREIGN KEY (food_id) REFERENCES foods(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_recipe_yield_positive CHECK (yield_weight_g IS NULL OR yield_weight_g > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recipe_id BIGINT UNSIGNED NOT NULL,
    ingredient_food_id BIGINT UNSIGNED NOT NULL,
    ingredient_position SMALLINT UNSIGNED NOT NULL,
    quantity_g DECIMAL(12,4) NOT NULL,
    retention_factor DECIMAL(6,5) NOT NULL DEFAULT 1.00000 COMMENT 'Only adjust when a source-backed nutrient retention factor is available',
    ingredient_note VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_recipe_ingredient_position (recipe_id, ingredient_position),
    KEY idx_recipe_ingredient_food (ingredient_food_id),
    CONSTRAINT fk_recipe_ingredient_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_recipe_ingredient_food FOREIGN KEY (ingredient_food_id) REFERENCES foods(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_recipe_ingredient_quantity_positive CHECK (quantity_g > 0),
    CONSTRAINT chk_recipe_retention_factor CHECK (retention_factor > 0 AND retention_factor <= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Initial source registry. The repository claims CC0, but IFCT/Gopalan upstream rights should be reviewed separately.
INSERT INTO food_sources (source_code, source_name, source_url, license_name, license_review_status, attribution_text, notes)
VALUES
('INDIAN_NUTRITION_GITHUB', 'Indian Food Nutrition Database (community repository)', 'https://github.com/prabhubng/indian-nutrition-data', 'CC0 1.0 claimed by repository', 'UPSTREAM_DECLARED', 'Source: Indian Food Nutrition Database; original source label retained per row.', 'Repository states CC0 and describes 620 records as sourced from IFCT 2017 and Gopalan 2004. Treat as staging input until provenance/licensing and nutrition quality are reviewed.'),
('USDA_FOODDATA_CENTRAL', 'USDA FoodData Central', 'https://fdc.nal.usda.gov/', 'CC0 1.0 Universal / public domain', 'CONFIRMED', 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.', 'Preferred supplemental source for compatible generic foods and preparation-specific records. Use exact FDC record IDs and preparation descriptions.'),
('INDIAN_NUTRIENT_DATABANK', 'Indian Nutrient Databank (INDB)', 'https://www.anuvaad.org.in/indian-nutrient-databank/', 'Open-access; redistribution terms to confirm', 'PERMISSION_REQUIRED', 'Indian Nutrient Databank (INDB), Anuvaad Solutions.', 'Candidate source for prepared Indian recipes. Confirm permission to bundle source data into the application before moving records to APPROVED.')
ON DUPLICATE KEY UPDATE
    source_name = VALUES(source_name),
    source_url = VALUES(source_url),
    license_name = VALUES(license_name),
    license_review_status = VALUES(license_review_status),
    attribution_text = VALUES(attribution_text),
    notes = VALUES(notes);

INSERT INTO nutrients (nutrient_code, display_name, standard_unit, display_order, is_core_macro)
VALUES
('energy_kcal','Energy','kcal',1,1),
('protein_g','Protein','g',2,1),
('carbohydrate_g','Carbohydrates','g',3,1),
('total_fat_g','Total fat','g',4,1),
('fiber_g','Dietary fiber','g',5,1),
('sugar_g','Total sugars','g',10,0),
('free_sugars_g','Free sugars','g',11,0),
('saturated_fat_g','Saturated fat','g',12,0),
('monounsaturated_fat_g','Monounsaturated fat','g',13,0),
('polyunsaturated_fat_g','Polyunsaturated fat','g',14,0),
('cholesterol_mg','Cholesterol','mg',15,0),
('sodium_mg','Sodium','mg',16,0),
('calcium_mg','Calcium','mg',20,0),
('iron_mg','Iron','mg',21,0),
('potassium_mg','Potassium','mg',22,0),
('magnesium_mg','Magnesium','mg',23,0),
('vitamin_c_mg','Vitamin C','mg',30,0),
('vitamin_d_ug','Vitamin D','µg',31,0),
('vitamin_b12_ug','Vitamin B12','µg',32,0),
('folate_ug','Folate','µg',33,0)
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    standard_unit = VALUES(standard_unit),
    display_order = VALUES(display_order),
    is_core_macro = VALUES(is_core_macro);

INSERT INTO food_categories (category_code, display_name)
VALUES
('cereals_millets','Cereals and millets'),
('legumes_pulses','Pulses and legumes'),
('eggs','Eggs'),
('poultry','Poultry'),
('meat','Meat'),
('fish_seafood','Fish and seafood'),
('dairy','Milk and dairy'),
('soy_plant_protein','Soy and plant protein'),
('supplements','Protein supplements'),
('nuts_seeds','Nuts and seeds'),
('vegetables','Vegetables'),
('fruits','Fruits'),
('oils_fats','Oils and fats'),
('spices_condiments','Spices and condiments'),
('south_indian_dishes','South Indian dishes'),
('other_prepared_dishes','Other prepared dishes'),
('packaged_foods','Packaged foods'),
('uncategorized','Uncategorized')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);
