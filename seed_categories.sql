-- Seed the three top-level categories.
-- Rename the third one once you decide what it is.
INSERT INTO categories (name, sort_order) VALUES
    ('Human Toxicity', 0),
    ('Physico-Chemical Characteristics', 1),
    ('Uncategorized', 2);

-- ---------------------------------------------------------------------------
-- OPTIONAL: example protocol + test link so the tree shows something before
-- you build out the CRUD UI. Replace the work_package/element/test values with
-- real ones from your tests, and the category_id with the id from above.
-- ---------------------------------------------------------------------------

-- INSERT INTO protocols (category_id, name, description, sort_order)
-- VALUES (1, 'Cytotoxicity', 'Cell-viability assays', 0);

-- INSERT INTO protocol_tests
--     (protocol_id, work_package_name, element_cms_id, test_name, sort_order)
-- VALUES
--     (1, 'WP3', 'YOUR_CMS_ID', 'MTT', 0),
--     (1, 'WP3', 'YOUR_CMS_ID', 'ROS', 1);